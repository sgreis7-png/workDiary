// The bug: sending a report failed with "interaction_in_progress" and stayed failing across
// reloads. MSAL sets that flag when an interactive sign-in starts and clears it when one
// finishes; a popup that is closed, blocked or abandoned never finishes. The cache lives in
// localStorage so the flag outlived the tab, and every later send was refused before it began.
//
// Recovering means clearing that one flag. These pin which keys count, because the key shape is
// MSAL's rather than ours: clearing a token or an account instead would silently sign the user
// out of Microsoft, which looks like the same symptom and is a different bug.
import { describe, it, expect } from 'vitest'
import { isInteractionInProgress, stuckInteractionKeys } from './outlookSend'

const CLIENT = '86c8bcfa-6525-4048-8b9b-b02bf210979d'

describe('stuck Microsoft sign-in', () => {
  it('recognises the error MSAL raises', () => {
    expect(isInteractionInProgress({ errorCode: 'interaction_in_progress' })).toBe(true)
    expect(isInteractionInProgress({ errorCode: 'popup_window_error' })).toBe(false)
    expect(isInteractionInProgress(new Error('interaction_in_progress'))).toBe(false) // code, not text
    expect(isInteractionInProgress(null)).toBe(false)
    expect(isInteractionInProgress(undefined)).toBe(false)
  })

  it('matches the interaction flag', () => {
    expect(stuckInteractionKeys([`msal.${CLIENT}.interaction.status`]))
      .toEqual([`msal.${CLIENT}.interaction.status`])
  })

  it('leaves tokens, accounts and everything else alone', () => {
    const keys = [
      `msal.${CLIENT}.interaction.status`,
      `msal.${CLIENT}.active-account-filters`,
      `msal.token.keys.${CLIENT}`,
      `${CLIENT}.9188040d-6c67-4c5b-b112-36a304b66dad-login.windows.net-accesstoken`,
      'msal.account.keys',
      'sb-fndoytitumlclapnjhnm-auth-token',
      'wd_owners_seen',
    ]
    // exactly one key is the flag; signing the user out of Microsoft is not the fix
    expect(stuckInteractionKeys(keys)).toEqual([`msal.${CLIENT}.interaction.status`])
  })

  it('is a no-op when nothing is stuck', () => {
    expect(stuckInteractionKeys([])).toEqual([])
    expect(stuckInteractionKeys(['wd_owners_seen', 'theme'])).toEqual([])
  })
})
