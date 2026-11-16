/**
 * The alerts that interrupt you (the cold-send question and the expiry toast)
 * in your language: Claude Code's `language` setting first, then the system
 * locale (`LC_ALL`, `LANG`), else English. The rows and the pane stay in
 * English.
 */

export type Lang = 'en' | 'es' | 'pt' | 'fr'

const NAMES: [RegExp, Lang][] = [
  [/^(es|spa|spanish|espa[ñn]ol|castellano)/i, 'es'],
  [/^(pt|por|portugu)/i, 'pt'],
  [/^(fr|fre|fra|french|fran[çc]ais)/i, 'fr'],
  [/^(en|eng|english)/i, 'en'],
]

/** The first of the given values that names a language we speak. */
export function langOf(...values: (string | undefined | null)[]): Lang {
  for (const v of values) {
    const t = v?.trim()
    if (!t || t === 'C' || t === 'POSIX') continue
    const hit = NAMES.find(([re]) => re.test(t))
    if (hit) return hit[1]
  }
  return 'en'
}

export type ColdAsk = { tokens: string; cold: string; warm: string; ago: string }
export type Expiring = { left: string; tokens: string; cold: string }

type Strings = {
  header: string
  question: (a: ColdAsk) => string
  send: (cold: string) => string
  hold: string
  held: string
  heldUnanswered: string
  expiring: (a: Expiring) => string
}

export const STRINGS: Record<Lang, Strings> = {
  en: {
    header: 'Cold cache',
    question: a =>
      `⚠ The prompt cache expired ${a.ago} ago. This message resends ${a.tokens} tokens uncached: about ${a.cold} at API prices, instead of ${a.warm} with a warm cache. Send it anyway?`,
    send: cold => `Send anyway (~${cold})`,
    hold: "Don't send",
    held: 'Not sent: the cache had expired. Send it again to go ahead, or /clear to start fresh for less.',
    heldUnanswered: 'Not sent: the cache had expired and nobody confirmed.',
    expiring: a => `⚠ The cache expires in ${a.left}. Any message renews it for free; after that, resending ${a.tokens} tokens costs ~${a.cold}.`,
  },
  es: {
    header: 'Caché fría',
    question: a =>
      `⚠ La caché del prompt venció hace ${a.ago}. Este mensaje reenvía ${a.tokens} tokens sin caché: unos ${a.cold} a precio de API, en vez de ${a.warm} con la caché activa. ¿Enviarlo igual?`,
    send: cold => `Enviar igual (~${cold})`,
    hold: 'No enviar',
    held: 'No se envió: la caché había vencido. Vuelve a enviarlo para seguir, o usa /clear para empezar de cero por menos.',
    heldUnanswered: 'No se envió: la caché había vencido y nadie lo confirmó.',
    expiring: a => `⚠ La caché vence en ${a.left}. Cualquier mensaje la renueva gratis; después, reenviar ${a.tokens} tokens cuesta ~${a.cold}.`,
  },
  pt: {
    header: 'Cache frio',
    question: a =>
      `⚠ O cache do prompt expirou há ${a.ago}. Esta mensagem reenvia ${a.tokens} tokens sem cache: cerca de ${a.cold} a preço de API, em vez de ${a.warm} com o cache ativo. Enviar mesmo assim?`,
    send: cold => `Enviar mesmo assim (~${cold})`,
    hold: 'Não enviar',
    held: 'Não enviado: o cache tinha expirado. Envie de novo para seguir, ou use /clear para recomeçar por menos.',
    heldUnanswered: 'Não enviado: o cache tinha expirado e ninguém confirmou.',
    expiring: a => `⚠ O cache expira em ${a.left}. Qualquer mensagem o renova de graça; depois, reenviar ${a.tokens} tokens custa ~${a.cold}.`,
  },
  fr: {
    header: 'Cache froid',
    question: a =>
      `⚠ Le cache du prompt a expiré il y a ${a.ago}. Ce message renvoie ${a.tokens} tokens sans cache : environ ${a.cold} au prix de l'API, au lieu de ${a.warm} avec un cache actif. L'envoyer quand même ?`,
    send: cold => `Envoyer quand même (~${cold})`,
    hold: 'Ne pas envoyer',
    held: "Non envoyé : le cache avait expiré. Renvoyez-le pour continuer, ou faites /clear pour repartir à moindre coût.",
    heldUnanswered: "Non envoyé : le cache avait expiré et personne n'a confirmé.",
    expiring: a => `⚠ Le cache expire dans ${a.left}. Tout message le renouvelle gratuitement ; ensuite, renvoyer ${a.tokens} tokens coûte ~${a.cold}.`,
  },
}
