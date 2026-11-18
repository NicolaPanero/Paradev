# Pulizia dei worktree di Paradev++

La manutenzione è integrata nell'app e nel servizio locale. Non richiede Python
né comandi da eseguire sui computer dei colleghi.

## Primo avvio dopo l'aggiornamento

Il servizio esegue una scansione del pregresso una sola volta. Se trova residui
verificabili, dopo la chiusura delle novità dell'aggiornamento apre l'anteprima.
La cancellazione parte con **Elimina le cartelle selezionate**. Chiudere la
finestra rimanda la pulizia alle impostazioni, senza riproporla a ogni avvio.
Se non ci sono residui, la scansione viene registrata senza aprire la finestra.

Il completamento della scansione e l'eventuale anteprima sono salvati sul disco
per organizzazione. Un riavvio recupera l'anteprima non ancora chiusa; una
scansione completata non riparte. Se il processo si interrompe durante la prima
scansione, il controllo viene completato all'avvio successivo.

## Pulizia dalle impostazioni

Aprire **Fork Settings → Storage → Clean up deleted workspaces → Preview**.
La ricerca delle impostazioni trova la voce anche con «worktree», «pulizia»,
«spazio» e «cleanup».

L'anteprima mostra nome, percorso, dimensione stimata e una parte del contenuto
di ciascuna cartella. Si può scegliere cosa eliminare. Al termine il resoconto
indica cartelle eliminate, saltate o non eliminabili, con i percorsi conservati
e il percorso del backup. Una nuova anteprima permette di riprovare.

## Cosa può essere eliminato

Una cartella deve appartenere a uno spazio di lavoro già cancellato, con il
relativo record archiviato nel database locale. Deve trovarsi nel percorso
gestito per quel progetto o nelle cartelle delle sessioni, ed essere stata
creata prima della cancellazione. I percorsi storici sotto `.superset`,
`.superset-fork`, `.paradev` e `.paradev-fork` rimangono riconosciuti.

Gli spazi di lavoro attivi, i loro checkout aggiuntivi e i repository principali
sono protetti. Vengono controllati anche i riferimenti dei profili locali
standard. I progetti nel cestino conservano i file necessari al ripristino.
Una cartella sconosciuta al database non diventa eliminabile soltanto perché
non compare nella sidebar.

Prima di ogni rimozione, il servizio ricontrolla il record di cancellazione,
l'identità della directory, il branch e i riferimenti attivi. Un workspace
ripristinato dopo l'anteprima viene conservato. Una directory sostituita,
un branch cambiato e una cartella usata come directory di lavoro da un processo
vengono saltati. Su Windows rimangono anche i vincoli sui file in uso imposti
dal sistema. Le anteprime scadono dopo 30 minuti e non possono essere riutilizzate
dopo la pulizia.

## File e metadati Git parzialmente rimossi

Git può togliere la registrazione di un worktree prima di aver eliminato tutti
i file. La cancellazione ordinaria verifica anche il disco, riconosce i vecchi
percorsi e completa la rimozione delle directory non scrivibili. Un errore nella
rimozione dei checkout aggiuntivi fa ricomparire il workspace per poter riprovare.

La manutenzione gestisce anche il pregresso senza `.git` o con un puntatore
interrotto. Se la registrazione Git sopravvive, verifica il collegamento esatto
tra cartella, repository e branch e rimuove soltanto quella registrazione.
Conserva i metadati e il diff dell'indice nel backup. Non esegue un `git worktree
prune` globale e non elimina branch.

Le cancellazioni storiche sottoposte a questa manutenzione restano sotto il
controllo dell'anteprima. Il recupero automatico delle cancellazioni nuove
interrotte da un arresto continua a gestire le operazioni già richieste dall'utente.

## Backup e spazio stimato

### Verificare i dati installati durante lo sviluppo

Il profilo di sviluppo può usare una copia dei soli metadati di lavoro dell'app
installata, senza importare account o chat. La copia risiede in
`<app-home>/fork/installed-worktree-preview/workspaces.sqlite`; nello stesso
percorso `source.json` indica `organizationId` e `readOnly: true`.

Questa modalità riguarda soltanto l'anteprima di pulizia. Il resto dell'app
continua a usare i dati di sviluppo. Il database copiato viene aperto in sola
lettura e non viene passato alle pulizie automatiche dell'app. La finestra mostra
i conteggi reali degli spazi attivi e archiviati e nasconde il comando di
eliminazione; anche il servizio rifiuta le richieste di cancellazione. La modalità
si attiva soltanto quando questi file sono presenti nel profilo locale.

### File recuperati

Il servizio conserva i diff dei file tracciati, i file non tracciati che Git
non ignora e i file `.env*` al primo livello. Per le sessioni autonome salva anche
la cronologia Git in un bundle. Quando i metadati Git sono già mancanti, copia
i file recuperabili, escludendo directory di dipendenze e build ricreabili come
`node_modules`, `.next`, `dist` e `build`. I collegamenti simbolici vengono
copiati come collegamenti.

Stato, report e backup risiedono nella cartella dati dell'app:

```text
<app-home>/fork/worktree-cleanup/<organizzazione>/state.json
<app-home>/fork/worktree-cleanup/<organizzazione>/backups/<operazione>/
```

Il resoconto mostra il percorso completo. `report.json` associa le cartelle ai
backup; `source.json` indica il repository e il commit disponibili. I branch
rimangono nel repository principale. Conservare i backup finché non sono state
verificate le modifiche recuperate.

La dimensione nell'anteprima è una stima: hard link, clone APFS e snapshot
possono condividere i blocchi. Lo spazio effettivamente liberato può quindi
essere inferiore alla somma indicata.

## Verifica e compatibilità

Le procedure `forkWorktreeCleanup.*` sono aggiuntive. Un client collegato a un
servizio precedente mantiene il resto delle impostazioni utilizzabile e richiede
l'aggiornamento quando si tenta la pulizia. Non servono migrazioni del database.

I test del fork usano database e repository temporanei. Verificano il controllo
iniziale persistente, la protezione degli spazi attivi e delle cartelle extra,
il ripristino dopo l'anteprima, i branch cambiati, i processi attivi, i metadati
Git mancanti, i backup e la selezione nella finestra.

```sh
bun run test:fork
```
