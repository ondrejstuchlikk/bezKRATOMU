// Nickname + PIN auth is implemented as Supabase email/password auth with a
// synthetic email "<slug>@<AUTH_EMAIL_DOMAIN>". The slug rules must match
// private.slugify_nickname() in supabase/migrations/0001_schema.sql.

export const AUTH_EMAIL_DOMAIN = 'kratom.local'

const ACCENTED = 'ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽÄÖÜĽĹŔÔáčďéěíňóřšťúůýžäöüľĺŕô'
const PLAIN = 'ACDEEINORSTUUYZAOULLROacdeeinorstuuyzaoullro'

/** Letters (incl. Czech/Slovak diacritics), digits, space, dot, dash, underscore; 3–20 chars. */
export const NICKNAME_PATTERN = new RegExp(`^[A-Za-z0-9${ACCENTED} _.-]{3,20}$`)

export function slugifyNickname(nickname: string): string {
  let out = ''
  for (const ch of nickname) {
    const i = ACCENTED.indexOf(ch)
    out += i >= 0 ? PLAIN[i] : ch
  }
  return out
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type NicknameError = 'too_short' | 'too_long' | 'invalid_chars' | 'invalid_slug'

export function validateNickname(raw: string): NicknameError | null {
  const nickname = raw.trim()
  if (nickname.length < 3) return 'too_short'
  if (nickname.length > 20) return 'too_long'
  if (!NICKNAME_PATTERN.test(nickname)) return 'invalid_chars'
  if (slugifyNickname(nickname).length < 2) return 'invalid_slug'
  return null
}

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

export function nicknameToEmail(nickname: string): string {
  return `${slugifyNickname(nickname.trim())}@${AUTH_EMAIL_DOMAIN}`
}
