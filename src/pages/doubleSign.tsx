import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import { PrimaryButton } from '../components/Button'
import { Description, PageTitle } from '../components/Text'
import {
  SingleContainer as Container,
  SingleWrap as Wrap,
  SingleButtonSection,
  TextSection,
  InnerWrap,
  Over,
} from '../components/Layout'
import {
  useEntropyStore,
} from '../store/contribute'
import {
  INFURA_ID,
  PORTIS_ID,
  FORTMATIC_KEY,
  BACKGROUND_DARKNESS,
} from '../constants'
import ROUTES from '../routes'
import { useState, useEffect } from 'react'
import ErrorMessage from '../components/Error'
import { ErrorRes, RequestLinkRes } from '../types'
import { Trans, useTranslation } from 'react-i18next'
import LoadingSpinner from '../components/LoadingSpinner'
import HeaderJustGoingBack from '../components/headers/HeaderJustGoingBack'
import { TypedDataDomain, TypedDataField } from '@ethersproject/abstract-signer';
import WalletConnectProvider from '@walletconnect/web3-provider'
import CoinbaseWalletSDK from '@coinbase/wallet-sdk'
import { Client } from '@spruceid/siwe-web3modal'
import Torus from '@toruslabs/torus-embed'
import Fortmatic from 'fortmatic'
import Portis from '@portis/web3'
import api from '../api'
import useLanguage from '../hooks/useLanguage'

const DoubleSignPage = () => {
  useLanguage()
  const [error, setError] = useState<null | string>(null)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { potPubkeys } = useEntropyStore()
  const { updateECDSASigner, updateECDSASignature } = useEntropyStore()

  useEffect(() => {
    // eslint-disable-next-line no-restricted-globals
    if (self.crossOriginIsolated) {
      console.log('refreshing...')
      navigate(0)
    } else {
      console.log(`${window.crossOriginIsolated ? "" : "not"} x-origin isolated`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const buildEIP712Message = async (): Promise<[
    TypedDataDomain,
    Record<string, TypedDataField[]>,
    Record<string, any>
  ]> => {
    // built the message to be signed
    const numG1Powers = [4096, 8192, 16384, 32768]
    const potPubkeysObj = []
    for (let i = 0; i < 4; i++) {
      const element = {
        numG1Powers: numG1Powers[i],
        numG2Powers: 65,
        potPubkey: potPubkeys![i]
      }
      potPubkeysObj.push(element)
    }
    const types = {
      PoTPubkeys: [{ name: 'potPubkeys', type: 'contributionPubkey[]' }],
      contributionPubkey: [
        { name: 'numG1Powers', type: 'uint256' },
        { name: 'numG2Powers', type: 'uint256' },
        { name: 'potPubkey', type: 'bytes' }
      ]
    }
    const domain = {
      name: 'Ethereum KZG Ceremony',
      version: '1.0',
      chainId: 1
    }
    const message = {
      potPubkeys: potPubkeysObj
    }
    return [domain, types, message]
  }


  const signPotPubkeysWithECDSA = async () => {
    const client = new Client({
      modal: {
        theme: 'dark',
        lightboxOpacity: BACKGROUND_DARKNESS,
        providerOptions: {
          walletconnect: {
            package: WalletConnectProvider,
            options: {
              infuraId: INFURA_ID,
              pollingInterval: 100000,
            },
          },
          torus: {
            package: Torus,
          },
          portis: {
            package: Portis,
            options: {
              id: PORTIS_ID,
            },
          },
          fortmatic: {
            package: Fortmatic,
            options: {
              key: FORTMATIC_KEY,
            },
          },
          walletlink: {
            package: CoinbaseWalletSDK,
            options: {
              appName: "Ethereum KZG Ceremony",
              infuraId: INFURA_ID,
            }
          },
        },
      },
      session: {
        domain: window.location.host,
        uri: window.location.origin,
        useENS: true,
        version: '1',
      },
    })
    client.web3Modal.clearCachedProvider()
    const provider = await client.initializeProvider()
    const { chainId } = await provider.getNetwork();
    if (chainId !== 1){
      setError(t('error.incorrectChainId'))
      setIsLoading(false)
      return
    }

    const [domain, types, message] = await buildEIP712Message()
    // TODO: method name might change in the future (no underscore)
    // https://docs.ethers.io/v5/api/signer/
    const signer = provider.getSigner()
    const signingAddress = (await signer.getAddress()).toLowerCase()
    const signature = await signer._signTypedData(domain, types, message)
    // save signature for later
    updateECDSASigner(signingAddress)
    updateECDSASignature(signature)
    await onSigninSIWE()
  }

  const onSigninSIWE = async () => {
    const requestLinks = await api.getRequestLink()
    const code = (requestLinks as ErrorRes).code
    switch (code) {
      case undefined:
        window.location.replace((requestLinks as RequestLinkRes).eth_auth_url)
        break
      case 'AuthErrorPayload::LobbyIsFull':
        navigate(ROUTES.LOBBY_FULL)
        return
      default:
        setError(JSON.stringify(requestLinks))
        break
    }
  }


  const handleClickSign = async () => {
    setError(null)
    setIsLoading(true)
    try {
      await signPotPubkeysWithECDSA()
    } catch (error) {
      console.log(error)
      setIsLoading(false)
    }
  }

  return (
    <>
      <HeaderJustGoingBack />
      <Over>
        <Container>
          <Wrap>
            <InnerWrap>
              <PageTitle>
                <Trans i18nKey="doubleSign.title">
                  Bind your <br /> Contribution
                </Trans>
              </PageTitle>
              <TextSection>
                {error && <ErrorMessage>{error}</ErrorMessage>}
                <Trans i18nKey="doubleSign.description">
                  <Description>
                    Signing below will bind each Summoner’s entropy contribution to
                    their Ethereum address. Participants will be redirected to a
                    "Sign-in with Ethereum" page, and then back to this interface to
                    complete the final steps of the process.
                  </Description>
                </Trans>
              </TextSection>
              <ButtonSection>
                {isLoading ?
                  <>
                    <CheckWalletDesc>
                      <Trans i18nKey="doubleSign.checkWallet">
                        Check your wallet to sign the contribution
                      </Trans>
                    </CheckWalletDesc>
                    <LoadingSpinner></LoadingSpinner>
                  </>
                  :
                  <PrimaryButton onClick={handleClickSign} disabled={isLoading}>
                    <Trans i18nKey="doubleSign.button">
                      Sign
                    </Trans>
                  </PrimaryButton>
                }
              </ButtonSection>
            </InnerWrap>
          </Wrap>
        </Container>
      </Over>
    </>
  )
}

const CheckWalletDesc = styled(Description)`
  margin-bottom: 0px;
  font-weight: 700;
`

const ButtonSection = styled(SingleButtonSection)`
  margin-top: 5px;
  height: auto;
`

export default DoubleSignPage
