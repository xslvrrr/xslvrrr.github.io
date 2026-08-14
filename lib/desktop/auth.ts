import { refreshDesktopBootstrap } from './bootstrap'
import { DESKTOP_BOOTSTRAP_UPDATED_EVENT } from './events'
import { clearDesktopLogoutPending, markDesktopLogoutPending } from './logout-lock'
import { readDesktopIdentity, writePortalDataCache } from './storage'
import {
  createDesktopBrowserLoginUrl,
} from './links'
import { openExternal } from './utils'

const DESKTOP_LOGIN_STATE_KEY = 'millennium-desktop-login-state-v1'
const DESKTOP_LOGIN_VERIFIER_KEY = 'millennium-desktop-login-verifier-v1'
const activeDesktopLoginStates = new Set<string>()

type TokenLoginResult = {
  success: boolean
  message?: string
  user?: {
    id: string
    name: string
    school: string
    portalUid?: string
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return encodeBase64Url(new Uint8Array(digest))
}

export async function beginDesktopBrowserLogin(): Promise<void> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32))
  const stateBytes = crypto.getRandomValues(new Uint8Array(24))
  const verifier = encodeBase64Url(verifierBytes)
  const state = encodeBase64Url(stateBytes)
  const challenge = await createCodeChallenge(verifier)
  window.sessionStorage.setItem(DESKTOP_LOGIN_STATE_KEY, state)
  window.sessionStorage.setItem(DESKTOP_LOGIN_VERIFIER_KEY, verifier)
  await openExternal(createDesktopBrowserLoginUrl(challenge, state))
}

export async function completeTokenLogin(token: string, verifier?: string): Promise<TokenLoginResult> {
  const loginResponse = await fetch('/api/auth/token-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, verifier }),
  })
  const result = await loginResponse.json().catch(() => null) as TokenLoginResult | null
  if (!loginResponse.ok) throw new Error(result?.message || 'Login failed')
  return result || { success: true }
}

export async function rollbackDesktopLogin(): Promise<void> {
  markDesktopLogoutPending()
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 5_000)
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      signal: controller.signal,
    }).catch(() => null)
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export function beginDesktopLoginTransaction(): void {
  markDesktopLogoutPending()
}

export async function completeDesktopPortalLogin(
  portalData: unknown,
  expectedOwnerId: string,
): Promise<void> {
  try {
    markDesktopLogoutPending()
    await writePortalDataCache(portalData, expectedOwnerId)
    const bootstrap = await refreshDesktopBootstrap()
    const identity = await readDesktopIdentity()
    if (bootstrap.ownerId !== expectedOwnerId || identity?.ownerId !== expectedOwnerId) {
      throw new Error('Desktop account identity did not match the portal login.')
    }
    clearDesktopLogoutPending()
    window.dispatchEvent(new CustomEvent(DESKTOP_BOOTSTRAP_UPDATED_EVENT, { detail: bootstrap }))
  } catch (error: unknown) {
    await rollbackDesktopLogin()
    throw error
  }
}

export async function completeDesktopLogin(token: string, state: string): Promise<void> {
  const expectedState = window.sessionStorage.getItem(DESKTOP_LOGIN_STATE_KEY)
  const verifier = window.sessionStorage.getItem(DESKTOP_LOGIN_VERIFIER_KEY)
  if (!expectedState || !verifier || state !== expectedState) {
    throw new Error('Desktop login was not initiated by this app instance.')
  }
  if (activeDesktopLoginStates.has(state)) {
    throw new Error('Desktop login is already being completed.')
  }

  activeDesktopLoginStates.add(state)
  markDesktopLogoutPending()
  try {
    const result = await completeTokenLogin(token, verifier)
    window.sessionStorage.removeItem(DESKTOP_LOGIN_STATE_KEY)
    window.sessionStorage.removeItem(DESKTOP_LOGIN_VERIFIER_KEY)
    if (!result.user?.id) throw new Error('Desktop login response did not include an account identity.')
    const bootstrap = await refreshDesktopBootstrap()
    const identity = await readDesktopIdentity()
    if (!identity || identity.ownerId !== result.user.id) {
      throw new Error('Desktop account could not be verified after local persistence.')
    }
    clearDesktopLogoutPending()
    window.dispatchEvent(new CustomEvent(DESKTOP_BOOTSTRAP_UPDATED_EVENT, { detail: bootstrap }))
  } catch (error: unknown) {
    await rollbackDesktopLogin()
    throw error
  } finally {
    activeDesktopLoginStates.delete(state)
  }
}
