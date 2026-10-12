// Help contacts shown on the "Bezpečnost a pomoc" page.
// ⚠️ Verify every number and link before publishing the app!

export interface HelpContact {
  name: string
  description: string
  /** Phone number to dial (digits only, used for the tel: link). */
  phone?: string
  url?: string
}

export const helpContacts: HelpContact[] = [
  {
    name: 'Záchranná služba – 155',
    description: 'Akutní ohrožení zdraví nebo života.',
    phone: '155',
  },
  {
    name: 'Tísňová linka – 112',
    description: 'Jednotné evropské číslo tísňového volání.',
    phone: '112',
  },
  {
    name: 'Linka první psychické pomoci – 116 123',
    description: 'Bezplatná anonymní krizová linka, nonstop.',
    phone: '116123',
  },
  {
    name: 'Národní linka pro odvykání – 800 350 000',
    description: 'Bezplatné poradenství při závislosti.',
    phone: '800350000',
  },
  {
    name: 'Mapa pomoci (adiktologické služby)',
    description: 'Vyhledání poraden a služeb pro lidi se závislostí ve tvém okolí.',
    url: 'https://www.drogy-info.cz/mapa-pomoci/',
  },
]
