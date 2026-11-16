/**
 * The alerts that interrupt you (the cold-send question and the expiry toast)
 * in your language, with nothing to set up: Claude Code's `language` setting
 * when there is one, else the language you write your prompts in, else
 * English. The rows and the pane stay in English.
 */

export type Lang = 'en' | 'es' | 'pt' | 'fr'

const NAMES: [RegExp, Lang][] = [
  [/^(es|spa|spanish|espa[ñn]ol|castellano)/i, 'es'],
  [/^(pt|por|portugu)/i, 'pt'],
  [/^(fr|fre|fra|french|fran[çc]ais)/i, 'fr'],
  [/^(en|eng|english)/i, 'en'],
]

/** The language a setting such as "spanish", "Español" or "es" names, if we speak it. */
export function langOf(value: string | undefined | null): Lang | null {
  const t = value?.trim()
  if (!t) return null
  return NAMES.find(([re]) => re.test(t))?.[1] ?? null
}

/** Words common in one language and rare in the others. */
const WORDS: Record<Lang, Set<string>> = {
  en: new Set(
    'the and to of is are that it you for with this can what how but please would should there have not be was if do my we on your just also like want'.split(' '),
  ),
  es: new Set(
    ('el los las y una del al por con está están qué cómo pero lo mi también puedes hacer esto eso ese esa este esta más hay ya muy quiero ' +
      'creo cuando porque bueno entonces nuestro nuestra mucha mucho gente caso tampoco nos cuesta igual sería tipo algo así cada todo ahora aquí ' +
      'puede tiene son cuenta pues sí podemos hacemos tengo vamos')
      .split(' '),
  ),
  pt: new Set(
    ('os você não uma isso mais muito então também fazer quero acho quando porque está obrigado do da dos das seu sua ao pelo pela num ' +
      'agora aqui tudo assim nosso nossa gente ainda pode tem são podemos vamos')
      .split(' '),
  ),
  fr: new Set(
    "le les des et une pour avec pas est je vous ce mais aussi très c'est faire veux quand parce du au aux sur nous être avoir tout peux suis".split(' '),
  ),
}

export type Tally = Record<Lang, number>
export const emptyTally = (): Tally => ({ en: 0, es: 0, pt: 0, fr: 0 })

/** Adds what a prompt says about its language to a running tally. */
export function tallyOf(text: string, into: Tally = emptyTally()): Tally {
  const words = text.toLowerCase().match(/[a-zà-ÿ']+/g) ?? []
  const out = { ...into }
  for (const w of words) for (const l of Object.keys(WORDS) as Lang[]) if (WORDS[l].has(w)) out[l] += 1
  return out
}

/** The setting's language, else the clear leader of what you write, else English. */
export function pickLang(setting: Lang | null, tally: Tally): Lang {
  if (setting) return setting
  const [best, second] = (Object.entries(tally) as [Lang, number][]).sort((a, b) => b[1] - a[1])
  return best && best[1] >= 3 && best[1] >= (second?.[1] ?? 0) * 1.5 ? best[0] : 'en'
}

/**
 * What a cold send weighs. On the API it's money; on a Claude subscription it
 * isn't, so there it's how many times a warm send it uses of the plan's
 * limits (the price ratio, the best measure there is).
 */
export type Weight = { kind: 'api'; cold: string; warm: string } | { kind: 'plan'; times: string }
export type ColdAsk = { tokens: string; ago: string; weight: Weight }
export type Expiring = { left: string; tokens: string; weight: Weight }

type Strings = {
  header: string
  question: (a: ColdAsk) => string
  send: (w: Weight) => string
  hold: string
  held: string
  heldUnanswered: string
  expiring: (a: Expiring) => string
}

export const STRINGS: Record<Lang, Strings> = {
  en: {
    header: 'Cold cache',
    question: a =>
      `⚠ The prompt cache expired ${a.ago} ago. This message resends ${a.tokens} tokens without the cache: ` +
      (a.weight.kind === 'api'
        ? `about ${a.weight.cold} at API prices, instead of ${a.weight.warm} with a warm cache.`
        : `about ${a.weight.times}× what a warm send uses of your plan's limits.`) +
      ' Send it anyway?',
    send: w => (w.kind === 'api' ? `Send anyway (~${w.cold})` : 'Send anyway'),
    hold: "Don't send",
    held: 'Not sent: the cache had expired. Send it again to go ahead, or /clear to start fresh for less.',
    heldUnanswered: 'Not sent: the cache had expired and nobody confirmed.',
    expiring: a =>
      `⚠ The cache expires in ${a.left}. Any message renews it for free; after that, resending ${a.tokens} tokens ` +
      (a.weight.kind === 'api' ? `costs ~${a.weight.cold}.` : `uses ~${a.weight.times}× a warm send of your plan's limits.`),
  },
  es: {
    header: 'Caché fría',
    question: a =>
      `⚠ La caché del prompt venció hace ${a.ago}. Este mensaje reenvía ${a.tokens} tokens sin caché: ` +
      (a.weight.kind === 'api'
        ? `unos ${a.weight.cold} a precio de API, en vez de ${a.weight.warm} con la caché activa.`
        : `gasta unas ${a.weight.times} veces más de los límites de tu plan que con la caché activa.`) +
      ' ¿Enviarlo igual?',
    send: w => (w.kind === 'api' ? `Enviar igual (~${w.cold})` : 'Enviar igual'),
    hold: 'No enviar',
    held: 'No se envió: la caché había vencido. Vuelve a enviarlo para seguir, o usa /clear para empezar de cero por menos.',
    heldUnanswered: 'No se envió: la caché había vencido y nadie lo confirmó.',
    expiring: a =>
      `⚠ La caché vence en ${a.left}. Cualquier mensaje la renueva gratis; después, reenviar ${a.tokens} tokens ` +
      (a.weight.kind === 'api' ? `cuesta ~${a.weight.cold}.` : `gasta ~${a.weight.times} veces más de los límites de tu plan.`),
  },
  pt: {
    header: 'Cache frio',
    question: a =>
      `⚠ O cache do prompt expirou há ${a.ago}. Esta mensagem reenvia ${a.tokens} tokens sem cache: ` +
      (a.weight.kind === 'api'
        ? `cerca de ${a.weight.cold} a preço de API, em vez de ${a.weight.warm} com o cache ativo.`
        : `usa cerca de ${a.weight.times} vezes mais dos limites do seu plano do que com o cache ativo.`) +
      ' Enviar mesmo assim?',
    send: w => (w.kind === 'api' ? `Enviar mesmo assim (~${w.cold})` : 'Enviar mesmo assim'),
    hold: 'Não enviar',
    held: 'Não enviado: o cache tinha expirado. Envie de novo para seguir, ou use /clear para recomeçar por menos.',
    heldUnanswered: 'Não enviado: o cache tinha expirado e ninguém confirmou.',
    expiring: a =>
      `⚠ O cache expira em ${a.left}. Qualquer mensagem o renova de graça; depois, reenviar ${a.tokens} tokens ` +
      (a.weight.kind === 'api' ? `custa ~${a.weight.cold}.` : `usa ~${a.weight.times} vezes mais dos limites do seu plano.`),
  },
  fr: {
    header: 'Cache froid',
    question: a =>
      `⚠ Le cache du prompt a expiré il y a ${a.ago}. Ce message renvoie ${a.tokens} tokens sans cache : ` +
      (a.weight.kind === 'api'
        ? `environ ${a.weight.cold} au prix de l'API, au lieu de ${a.weight.warm} avec un cache actif.`
        : `environ ${a.weight.times} fois plus des limites de votre forfait qu'avec un cache actif.`) +
      " L'envoyer quand même ?",
    send: w => (w.kind === 'api' ? `Envoyer quand même (~${w.cold})` : 'Envoyer quand même'),
    hold: 'Ne pas envoyer',
    held: "Non envoyé : le cache avait expiré. Renvoyez-le pour continuer, ou faites /clear pour repartir à moindre coût.",
    heldUnanswered: "Non envoyé : le cache avait expiré et personne n'a confirmé.",
    expiring: a =>
      `⚠ Le cache expire dans ${a.left}. Tout message le renouvelle gratuitement ; ensuite, renvoyer ${a.tokens} tokens ` +
      (a.weight.kind === 'api' ? `coûte ~${a.weight.cold}.` : `consomme ~${a.weight.times} fois plus des limites de votre forfait.`),
  },
}
