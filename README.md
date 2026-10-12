# bezKRATOMU

Mobilní webová aplikace, která pomáhá skupině kamarádů postupně snižovat dávky kratomu.

## Lokální spuštění

```bash
npm install
cp .env.example .env.local   # doplň Supabase URL a anon key
npm run dev
```

## Příkazy

- `npm run dev` – vývojový server
- `npm test` – unit testy (Vitest)
- `npm run build` – produkční build do `dist/`

Nasazení na GitHub Pages proběhne automaticky po pushi do větve `main`.
