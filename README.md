# ♞ Scacco — PWA di scacchi gratuita

App di scacchi installabile (PWA) con grafica curata, animazioni fluide e tre modalità di gioco. Nessun server da pagare, nessun costo di gestione.

## Modalità di gioco

| Modalità | Come funziona |
|---|---|
| **Contro il dispositivo** | IA integrata con 3 livelli (Apprendista, Stratega, Maestro). Funziona anche offline. |
| **Due giocatori qui** | Stesso telefono/computer, a turni. |
| **Sfida con invito** | Crei una partita, mandi il link o il codice a un amico e giocate online in tempo reale (connessione diretta peer-to-peer tramite PeerJS, servizio gratuito). |

Tutte le regole sono complete: arrocco, en passant, promozione con scelta del pezzo, stallo, ripetizione, regola delle 50 mosse.

## Pubblicare su GitHub Pages (gratis, 5 minuti)

1. Crea un repository pubblico su GitHub (es. `scacco`).
2. Carica **tutti i file di questa cartella** nella radice del repository.
3. Vai in **Settings → Pages → Source: Deploy from a branch**, scegli `main` e cartella `/ (root)`, salva.
4. Dopo 1–2 minuti l'app è online su `https://TUONOME.github.io/scacco/`.

Da quel link chiunque può giocare e **installare l'app**: su iPhone con Safari → Condividi → "Aggiungi a Home", su Android con il pulsante "Installa app".

## E l'App Store di Apple?

Due strade, in ordine di costo:

1. **Gratis (consigliata per iniziare):** la PWA si installa già su iPhone da Safari con "Aggiungi a Home" — icona, schermo intero, funzionamento offline. Zero costi, zero revisioni.
2. **App Store vero e proprio:** bisogna impacchettare la PWA (con [PWABuilder](https://www.pwabuilder.com), gratuito) e pubblicarla con un account **Apple Developer Program, che costa 99 $/anno**. Questo è l'unico costo non eliminabile: lo richiede Apple per qualsiasi app sullo Store, anche gratuita.

## Note tecniche

- `index.html` + `style.css` + `app.js` — interfaccia, regole (chess.js) e IA minimax con potatura alfa-beta.
- `sw.js` — service worker: dopo la prima visita l'app funziona offline (la modalità online richiede ovviamente la rete).
- `manifest.webmanifest` + `icons/` — installazione come app.
- Le partite con invito usano il server di segnalazione pubblico e gratuito di PeerJS solo per mettere in contatto i due giocatori; le mosse viaggiano poi direttamente tra i due dispositivi.

## Licenza

Codice dell'app: usalo e modificalo liberamente. La libreria chess.js è con licenza BSD, PeerJS con licenza MIT.
