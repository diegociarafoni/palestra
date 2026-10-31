# Raccogliere prima, generare poi, verificare sempre

Gli strumenti esistenti per progettare una scheda (skill Claude, server MCP, GPT, app di coaching come Fitbod, JuggernautAI, RP Hypertrophy, Alpha Progression, Hevy Trainer e Technogym Coach) non offrono regole di programmazione migliori di quelle già fissate nel progetto. Offrono però tre cose che la specifica "Scheda v1" ancora non prevede. La prima è una **fase di raccolta esplicita** del profilo prima della bozza: la revisione ombrello sull'aderenza indica l'esplorazione iniziale di caratteristiche, barriere e facilitatori come il fattore più citato. La seconda è una **checklist di accettazione** costruita sui difetti che gli studi 2023–2026 riscontrano in modo ricorrente nei piani generati da LLM. In quei piani mancano l'intensità o il punto di arresto della serie, il volume, lo screening, i test e il monitoraggio; la frequenza dichiarata non coincide con il calendario; lo stesso prompt cambia gli esercizi da un'esecuzione all'altra. La terza è un insieme di **meccanismi di adattamento semplici**: un'alternativa pre-approvata per ogni esercizio, la sequenza A/B al posto del calendario, una regola di rientro dopo una pausa, la progressione scritta come regola condizionale e verificabile sui dati Mywellness. Sul fronte sanitario la prassi professionale converge su uno **screening proporzionato**. Per un adulto sedentario senza malattie né sintomi l'algoritmo ACSM non richiede un nulla osta medico. Il PAR-Q+ (versione 01-11-2024) fa da filtro sì/no. In Italia Virgin Active chiede comunque il certificato per attività non agonistica, quindi la visita medica c'è già e conviene usarla. Il rischio maggiore per un principiante a 2 sedute settimanali non è il volume troppo basso: sono la complessità, il volume eccessivo e l'abbandono nelle prime 6 settimane. La specifica deve quindi aggiungere un questionario, un protocollo di valutazione submassimale e regole di revisione che controllino l'aderenza prima dei carichi. Questo report non ripete i principi di programmazione, il protocollo BIA, il recupero e la nutrizione, già trattati nella ricerca precedente "Conoscenze scheda e BIA" (`/home/claude/reports/Conoscenze scheda e BIA.md`), e vi rimanda dove servono.

> **Avvertenza.** Il contenuto è informazione generale, non parere medico. Lo screening descritto serve a capire quando fermarsi e chiedere a un medico, non a sostituirlo. Le traduzioni italiane del PAR-Q+ sono di lavoro: non esiste una traduzione ufficiale della versione 2025, almeno tra le fonti consultate. Data della ricerca: 31 ottobre 2026.

## Le skill pubblicate danno struttura, non regole numeriche

Le skill Claude dedicate ai programmi di allenamento sono quasi tutte **prompt di ruolo senza numeri**. `workout-program-designer` di OneWave-AI elenca gli argomenti da coprire (sovraccarico progressivo, deload, prevenzione infortuni, metriche) e una procedura in cinque passi generici. Non contiene una regola numerica né un elenco di input, e la sua "best practice" più concreta è "Stay Current: Use latest best practices for fitness" ([SKILL.md](https://cdn.jsdelivr.net/npm/aiden-runtime@4.10.0/skills/installed/workout-program-designer/SKILL.md)). `fitness-coach` di tatat aggiunge alcune regole di sicurezza: riscaldamento e defaticamento sempre presenti, riposo tra sedute che allenano gli stessi muscoli, fermarsi in caso di dolore. Non prevede però alcuna fase di validazione ([claudemarketplaces.com](https://claudemarketplaces.com/skills/tatat/agents-playground/fitness-coach)). Non risultano una skill ufficiale Anthropic né un plugin Claude Code dedicati alla programmazione dell'allenamento.

Due progetti valgono come modelli di struttura. La skill multi-agente **`74-fitness-program` di revfactory** separa i ruoli: un orchestratore raccoglie gli input (obiettivo, livello, sedute, minuti, attrezzi; facoltativi età, peso, infortuni), un `program-architect` progetta il programma, `exercise-guide` scrive i cue tecnici, `template-builder` prepara il tracking e un passo finale verifica la coerenza tra le parti, con **al massimo 2 revisioni** richieste all'architetto. Due regole sono direttamente riusabili. Se il livello non è noto, la skill progetta per un principiante e lo dichiara. In caso di infortunio esclude o sostituisce gli esercizi a rischio e rende più prudente la progressione, invece di limitarsi a un avviso ([skillsmp.com](https://skillsmp.com/skills/revfactory-harness-100-en-74-fitness-program-claude-skills-fitness-program-skill-md)). Il flusso ricalca quello del repository: scheda, note KB per esercizio, report, revisione. Il server MCP **`strength-training-mcp`** espone invece come strumenti separati il calcolo della fatica, la modifica della seduta e l'aggiustamento del piano. Le decisioni ammesse formano un **vocabolario chiuso** (DELOAD_WEEK, SCALE_WEEK, SHIFT_VOLUME, ADD_REST_DAY) e il server restituisce `MISSING_BASELINE` quando lo storico è insufficiente ([glama.ai](https://glama.ai/mcp/servers/daiduo2/strength-training-mcp)). È il modello giusto per le decisioni della revisione mensile: un'etichetta da un elenco finito, più una riga di motivazione.

I progetti open source maturi non affidano la progressione a un LLM: la scrivono come **dato eseguibile**. In wger una regola modifica peso, ripetizioni, serie o RIR con operazioni fisse e può dipendere da un requisito. Nell'esempio del manuale il carico sale di 1,25 kg a settimana solo se nella seduta precedente sono state completate tutte le ripetizioni previste, altrimenti resta invariato ([wger manual](https://wger.readthedocs.io/en/latest/manual/routines.html)). Liftosaur usa uno script con stato (`state.weight`, `state.failures`) che conta i fallimenti e decide il deload ([GitHub astashov/liftosaur](https://github.com/astashov/liftosaur)). Il prototipo di ricerca più vicino a Scheda v1 è **PlanFitting** (ACM CUI '25). L'agente chiede in modo proattivo tre tipi di vincolo: obiettivi, disponibilità e ostacoli prevedibili. Gli esercizi vengono scelti solo da un **catalogo chiuso di 112 esercizi**. L'output è una serie di regole "IF disponibilità THEN esercizio", ciascuna con un piano di riserva "IF ostacolo THEN alternativa". A ogni ritorno dell'utente l'agente chiede se ha seguito il piano e se ne è soddisfatto, prima di proporre una progressione. Tre fisioterapisti hanno giudicato frequenza, intensità e tempo sopra la media, ma hanno indicato come punto debole la **composizione degli esercizi** ([arXiv 2309.12555](https://arxiv.org/html/2309.12555v2)). Per Scheda v1 il catalogo chiuso corrisponde a "Technogym App ∩ attrezzi di Via Mantova". La lezione è che il catalogo da solo non basta: serve un controllo esplicito dell'equilibrio tra schemi motori.

## Gli studi sugli LLM elencano i difetti da intercettare

Gli studi su piani di allenamento generati da LLM hanno un esito costante: **bozze plausibili ma sistematicamente incomplete**. Zaleski e colleghi hanno confrontato 26 raccomandazioni di ChatGPT 3.5 con le linee guida ACSM. L'accuratezza era del **90,7%**, la completezza solo del **41,2%**, e il volume non era mai indicato in modo completo (0%). L'errore più frequente, nel 53% dei casi, era il contrario della sottovalutazione del rischio: raccomandare un **nulla osta medico non necessario** ad adulti sani inattivi che iniziano a intensità leggera o moderata ([JMIR Medical Education 2024](https://mededu.jmir.org/2024/1/e51308)). Nel 2024 Havers e colleghi hanno fatto valutare a 12 coach su 28 voci i piani di ipertrofia di GPT-4 e Gemini. Screening (0–2,5) e test e monitoraggio (≈0) erano quasi assenti. Con il prompt povero i piani risultavano privi di intensità o incoerenti, per esempio "ogni muscolo 2 volte a settimana" con sedute in cui il muscolo compare una volta sola. Il prompt dettagliato migliorava nettamente la qualità. Ripetendo lo stesso prompt, la qualità restava stabile in 27 voci su 28, ma **gli esercizi cambiavano** ([Biology of Sport 2025;42(2)](https://www.termedia.pl/Reproducibility-and-quality-of-hypertrophy-related-training-plans-generated-by-GPT-4-and-Google-Gemini-as-evaluated-by-coaching-experts,78,55336,1,1.html)). Nel secondo studio dello stesso gruppo (piani di 16 settimane, 10 coach, 27 voci) il piano di ipertrofia di ChatGPT non dava alcuna indicazione di intensità (mediana 1,5 sul set endpoint). Gemini mescolava gli obiettivi e **contava i giorni di recupero come sedute**. Gli autori giudicano comunque i piani "usable starting templates" ([Biology of Sport 2025;42(4)](https://www.termedia.pl/A-professional-assessment-of-training-plans-for-muscle-hypertrophy-and-maximal-strength-developed-by-generative-artificial-intelligence,78,56339,1,1.html)). Washif e colleghi rilevano inoltre recuperi tra le serie uniformi in tutte le fasi, tempi di esecuzione non allineati alle evidenze e nessun adattamento ai progressi ([Biology of Sport 2024](https://rcastoragev2.blob.core.windows.net/1743a6e8fccaf0fac3449d126bbb6397/JBS-41-51817.PMC10955742.pdf)).

Questi risultati vanno letti con due cautele. I modelli testati sono vecchi (GPT-3.5/4, Gemini 1.0) e non esistono valutazioni pubblicate di Claude o dei modelli 2025–2026 su programmi di forza. Inoltre l'accordo tra i valutatori è basso (kappa 0,046–0,216), segno che anche gli esperti non concordano su cosa sia un buon piano. Uno studio del 2026 trova che, su domande generali dei clienti, le risposte di ChatGPT 3.5 superano quelle di 9 personal trainer certificati in 6 domande su 9 ([JSSM 2026](https://www.jssm.org/25-1-235.p_d_f)). Riguarda però spiegazioni generali, non prescrizioni individuali. La conclusione operativa non dipende comunque dal modello usato. I difetti noti sono **verificabili meccanicamente**: un campo RIR vuoto, un volume per muscolo non calcolato, una somma dei tempi oltre i 60 minuti, un numero di sedute nel calendario diverso da 2. Possono quindi diventare criteri di accettazione della scheda e, in parte, controlli automatici su `scheda.json`. C'è poi la variabilità tra esecuzioni: rigenerare la scheda da zero ogni mese sostituirebbe esercizi senza motivo e cancellerebbe lo storico per esercizio. La scheda va invece modificata con un diff motivato rispetto alla versione precedente, tenuta nel contesto del Progetto.

## Le app commerciali convergono su pochi input e quattro meccanismi

Le app di coaching chiedono in onboarding quasi sempre gli stessi campi: obiettivo, esperienza, attrezzi, frequenza, durata ed eventuale gruppo muscolare prioritario. Per Scheda v1 sono già tutti fissati dai vincoli. Fitbod usa la durata per stabilire il numero di esercizi: 35–60 minuti con 5 esercizi, 39–63 con 6 ([Fitbod Help](https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout)). Hevy Trainer aggiunge dati anagrafici e un **disclaimer sanitario obbligatorio** ([Hevy Help](https://help.hevyapp.com/hc/en-us/articles/38385724273047-Hevy-Trainer-Explained-How-It-Builds-Your-Workout-Program)). Solo JuggernautAI chiede anche livelli di forza e fattori di stile di vita ([JTS Help Center](https://help.jtsstrength.com/en/articles/3-how-juggernautai-is-individualized-to-you)). Nessuna fonte primaria documenta domande su infortuni o su esercizi graditi e sgraditi: le app apprendono le preferenze dopo, dal comportamento. Il questionario di Scheda v1 può quindi tralasciare i campi già fissati e concentrarsi su ciò che le app raccolgono male: limitazioni, preferenze, stile di vita, barriere.

| Meccanismo | Chi lo usa | Come funziona | Natura | Adattamento a Scheda v1 |
| --- | --- | --- | --- | --- |
| Readiness pre-seduta | JuggernautAI | sonno, umore, energia, indolenzimento modificano volume o carico del giorno; RPE dei top set aggiusta le serie successive | commerciale, regole numeriche non pubblicate | 4 voci 1–5 prima della seduta, raccordate al semaforo del recupero già definito nella ricerca precedente |
| Feedback per muscolo | RP Hypertrophy | pump, indolenzimento, recupero e carico percepito portano a +/=/− serie; deload fisso nell'ultima settimana del mesociclo | commerciale; scale esatte e domanda sul dolore articolare **[non verificato]** | troppo granulare per 2 sedute settimanali; al massimo una tabella mensile per gruppo muscolare |
| Sostituzione | Fitbod | "Replace Exercise" con alternativa per lo stesso gruppo muscolare, filtrata per attrezzi; "di più / di meno / mai più" | commerciale | una colonna "alternativa pre-approvata" per esercizio, scelta in revisione e non in sala |
| Sequenza e pause | Hevy Trainer, Dr. Muscle | la routine successiva si sblocca solo completando la corrente; pausa ≥ 10 giorni porta a una seduta leggera; deload se l'1RM stimato cala (−50% serie, −10% carico) | commerciale, soglie non validate | A/B in sequenza, mai recuperare la seduta saltata; regola di rientro; soglie da registrare come decisione |

I dati vengono dalle pagine ufficiali di [RP](https://help.rpstrength.com/hc/en-us/articles/33510413024279-Does-the-app-automatically-place-deloads) e [Dr. Muscle](https://dr-muscle.com/what-makes-dr-muscle-different/). Per RP la fonte principale è un'analisi di un concorrente ([Alpha Progression](https://alphaprogression.com/en/blog/alpha-progression-vs-rp-hypertrophy)). Da questa fonte viene anche un'idea utile per gli attrezzi Technogym: se il salto di carico disponibile è troppo grande, si aumentano prima le ripetizioni. Va quindi registrato per ogni attrezzo l'**incremento minimo**. Le critiche degli utenti puntano tutte nella stessa direzione. Un utente RP riferisce "WAYYY more volume than I needed", 35–40 serie in un giorno, e giudica l'app inadatta ai principianti ([Medium, 2024](https://medium.com/@justinsmith31491/i-used-the-rp-hypertrophy-app-for-6-months-f20e67378b20)). Sul forum Freeletics alcuni utenti lamentano allenamenti che non si adattano al feedback ([forum Freeletics](https://forum.freeletics.com/t/workouts-not-adapting-based-on-my-feedback/3027)). Per un principiante la priorità resta partire bassi e salire solo con i dati.

**Technogym Coach** è il caso meno utile come modello e il più utile come infrastruttura. La pagina ufficiale descrive un piano costruito su obiettivo, livello e attrezzi, che "si adatta automaticamente". Non pubblica né il questionario né le regole di adattamento ([Technogym App](https://www.technogym.com/en-INT/technogym-app/)). Il suo valore per il progetto è la raccolta dei dati (Mywellness, MOVEs, attrezzi connessi), non la logica, che resta in `docs/linee-guida-allenamento.md`. Non è verificato se a Via Mantova sia disponibile il Technogym Checkup con BIA [non verificato]. Le soglie numeriche di tutte queste app (≥ 10 giorni, −10%, −50% serie) sono **scelte commerciali**, non evidenza. Se adottate, vanno registrate in `kb/decisioni/` come valori di partenza. Per lo scarico la ricerca precedente ha già scelto la versione reattiva (checklist a 5 domande, con 2 o più "sì" si considera lo scarico), che resta preferibile al deload a calendario di RP.

## Lo screening serve a sapere quando fermarsi, non a medicalizzare

Il **PAR-Q+** in vigore è datato 01-11-2024 (©2025). Ha 7 domande generali sì/no: se tutte le risposte sono "no" si inizia gradualmente; con un "sì" si passa a 10 aree di approfondimento e, con un ulteriore "sì", si cerca un parere medico o si usa l'ePARmed-X+ prima di aumentare l'attività ([PAR-Q+ 2025](https://southlake.ca/wp-content/uploads/2025/02/PARQPlus2025-Form-fillable.pdf)). Lo stesso modulo prevede che chi ha **più di 45 anni e non è abituato a esercizio vigoroso o massimale** consulti un professionista prima di arrivare a quell'intensità. Prevede anche di rinviare l'attività in caso di malattia temporanea e di ricompilare il questionario quando la salute cambia. Non è stato possibile verificare sul sito ufficiale eparmedx.com l'esistenza di una versione successiva [non verificato]. L'**algoritmo ACSM** ha abbandonato il conteggio dei fattori di rischio e si basa su tre elementi: pratica regolare di esercizio (≥ 3 giorni/settimana, ≥ 30 minuti, intensità moderata, da ≥ 3 mesi), malattia cardiovascolare, metabolica o renale nota, segni o sintomi. Un non praticante senza malattie né sintomi **non ha bisogno di nulla osta** e inizia a intensità leggera-moderata (RPE 12–13 su scala 6–20). Qualsiasi sintomo richiede invece un nulla osta prima di qualunque attività ([Open Exam Prep, ACSM-CPT](https://open-exam-prep.com/study-guides/acsm-cpt/chapter-2-health-screening/preparticipation-screening-algorithm); [ACSM, casi di studio](https://www.acsm.org/blog-detail/acsm-certified-blog/2020/08/19/acsm-preparticipation-screening-case-studies)). La fonte ACSM consultata è una sintesi didattica: non è verificato che la 12a edizione delle *Guidelines* modifichi l'algoritmo [non verificato].

Il quadro italiano rende lo screening meno critico di quanto appaia. Il DL 69/2013 ha abolito l'obbligo di certificato per l'attività ludico-motoria, ma la palestra può richiederlo per contratto ([Studio Cataldi](https://www.studiocataldi.it/articoli/42124-il-certificato-sportivo.asp)), e **Virgin Active lo richiede** per l'attività non agonistica, all'iscrizione o al più tardi al primo accesso ([Virgin Active Help Center](https://helpcenter.virginactive.it/hc/en-150/articles/37562544120721-Is-a-medical-certificate-required-to-attend-the-Club-Here-s-everything-you-need-to-know)). Il certificato è rilasciato dal medico di base o dal medico dello sport secondo il DM 8 agosto 2014, con esame clinico ed elettrocardiogramma ([DM 8 agosto 2014](https://federciclismo.it/download/207/decreti-ministeriali/163608/d-m-del-08-agosto-2014.pdf)). Non è stato possibile verificare sull'Allegato 1 la periodicità dell'ECG e la validità annuale [non verificato]. Ne seguono due conseguenze per la specifica. La prima: la visita per il certificato è il momento naturale per porre al medico le domande che il PAR-Q+ fa emergere (pressione, ECG, limiti a carichi o esercizi), quindi la specifica deve registrarne data, scadenza ed eventuali limitazioni. La seconda: Claude non deve replicare l'errore documentato da Zaleski. Se il PAR-Q+ è tutto "no" e il certificato è valido, la scheda parte senza ulteriori rinvii al medico. Lo screening interviene solo su un "sì", su un sintomo o su un test massimale oltre i 45 anni.

Sulla valutazione iniziale le fonti professionali spingono verso test **submassimali, ripetibili e con criteri chiari di stop**. Per lo screening del movimento NASM usa l'overhead squat: 5 ripetizioni filmate di fronte e di lato, osservando piedi, ginocchia, busto, lombare e braccia ([NASM](https://blog.nasm.org/fitness/how-to-perform-an-overhead-squat-assessment-osa)). Il sit-to-stand in 30 secondi ha alta attendibilità test-retest. Per uomini di 20–59 anni la media è 24,2 alzate (DS 6,3) e la differenza minima rilevante è di circa 2 ripetizioni, ma il test nasce per anziani e va usato come confronto con se stessi ([Shirley Ryan AbilityLab](https://www.sralab.org/rehabilitation-measures/30-second-sit-stand-test)). Per push-up e plank negli uomini di 30–50 anni non sono state trovate norme verificate [non verificato], e lo stesso vale per il test del cammino di 6 minuti negli adulti sani [non verificato]. Si usano quindi solo come riferimento personale. Per i carichi sui macchinari nessuna fonte giustifica un 1RM per un principiante non supervisionato. La calibrazione submassimale è un'inferenza prudenziale coerente con la soglia PAR-Q+ dei 45 anni e con la procedura già descritta nella ricerca precedente: serie di avvicinamento e poi una serie di lavoro a RIR 3, con correzione del 4% per ogni ripetizione fuori range.

## L'aderenza si decide nelle prime sei settimane

La revisione ombrello di Collado-Mateo e colleghi classifica i fattori di aderenza all'esercizio. Il più citato è l'**esplorazione iniziale di caratteristiche, barriere e facilitatori**; seguono il supporto sociale, il programma individualizzato, l'integrazione nella vita quotidiana, l'autoefficacia, il monitoraggio dei progressi, il ruolo attivo del partecipante e le aspettative realistiche. Gli obiettivi devono essere **controllabili** e negoziati, non legati solo a esiti incontrollabili come una perdita di peso rapida. Il piacere conta perché è una ricompensa immediata, mentre fatica e dolore inattesi riducono la partecipazione ([IJERPH 2021](https://www.mdpi.com/1660-4601/18/4/2023/htm)). Un preprint su una catena di palestre turca riporta un dato concreto: metà dei nuovi iscritti interrompe la frequenza entro la **settimana 6** e l'80% entro la settimana 17. Per superare la soglia delle 6 settimane servivano circa **9 visite**, cioè circa 2 a settimana. L'orario non influiva sulla persistenza, ma oltre l'84% di chi continuava manteneva la stessa fascia oraria. Le sedute con un personal trainer avevano l'effetto più forte ([Demirci et al., arXiv 2025](https://arxiv.org/pdf/2501.01779)). Lo studio non è sottoposto a revisione paritaria e riguarda una sola catena, ma il segnale è coerente con la revisione.

Per l'utente, che non ha un trainer, la specifica deve fornire dei sostituti. Il primo sono **giorni e fascia oraria fissi**, scritti come intenzione di implementazione ("quando è martedì alle 19, faccio la seduta A"), con un piano B esplicito. Le intenzioni di implementazione nell'esercizio non sono state verificate su fonti primarie in questa ricerca [non verificato], ma derivano direttamente dai fattori "integrazione nella vita quotidiana" e "obiettivi controllabili". Il secondo è una **fase abitudine** nelle prime 6 settimane, con obiettivo di processo 12 sedute su 12 e la regola di non saltarne due di fila. Il terzo sono **obiettivi di processo** affiancati a quelli di risultato. Gli indicatori di ricomposizione sono lenti e rumorosi: la soglia di 1,1 kg sulla BIA discussa nella ricerca precedente lo conferma. Il quarto è una revisione mensile che, come in PlanFitting, **chiede prima l'aderenza e la soddisfazione** e solo dopo tocca i carichi: se l'aderenza è bassa si rivede la struttura (orari, durata, esercizi sgraditi), non la progressione. Le domande di stile "colloquio motivazionale" (importanza e fiducia da 0 a 10) sono incluse nel questionario come strumento pratico, ma la loro efficacia nel fitness non è stata verificata in questa ricerca [non verificato].

## Conclusione

Il vantaggio di Scheda v1 rispetto alle app non sta nell'algoritmo, che nelle app commerciali è opaco e tarato su soglie arbitrarie. Sta nella possibilità di rendere ogni regola **esplicita, versionata e verificabile** sui dati sincronizzati. Gli studi sugli LLM non dicono che Claude non sappia scrivere una scheda: dicono che una scheda scritta senza input completi e senza controlli finali omette proprio le parti che il progetto deve misurare (intensità, volume, test, monitoraggio). La specifica deve quindi spostare il peso dalla generazione ai suoi due estremi: un intake che fissi i vincoli prima della bozza e una checklist che respinga la bozza se un campo verificabile manca o non torna.

Il secondo spostamento riguarda la revisione mensile. Il primo indicatore da guardare non è la progressione del carico ma l'aderenza nelle prime 6 settimane, la variabile che più spesso decide se ci sarà un secondo mese da rivedere. Lo screening sanitario, infine, deve restare leggero: il certificato Virgin Active e un PAR-Q+ tutto "no" bastano per iniziare. Chiedere un nulla osta superfluo è l'errore più frequente documentato negli LLM, e da evitare tanto quanto il suo opposto.

---

## Idee da importare nella specifica Scheda v1

Legenda: **[C]** = scelta commerciale o di progetto, non evidenza; **[I]** = inferenza di questa ricerca; senza marcatore = sostenuto da studio, linea guida o documentazione.

### Priorità alta

1. **Fase di intake obbligatoria prima della bozza** (questionario sotto), con le risposte salvate nel profilo del Progetto; la scheda non si genera con campi critici mancanti. Fonti: [Collado-Mateo 2021](https://www.mdpi.com/1660-4601/18/4/2023/htm); [PlanFitting](https://arxiv.org/html/2309.12555v2); [revfactory](https://skillsmp.com/skills/revfactory-harness-100-en-74-fitness-program-claude-skills-fitness-program-skill-md).
2. **Prerequisito sanitario**: PAR-Q+ tutto "no" (oppure parere medico) e certificato non agonistico valido con data di scadenza registrata; nessun altro rinvio al medico se queste condizioni valgono. Fonti: [PAR-Q+ 2025](https://southlake.ca/wp-content/uploads/2025/02/PARQPlus2025-Form-fillable.pdf); [ACSM](https://open-exam-prep.com/study-guides/acsm-cpt/chapter-2-health-screening/preparticipation-screening-algorithm); [Virgin Active](https://helpcenter.virginactive.it/hc/en-150/articles/37562544120721-Is-a-medical-certificate-required-to-attend-the-Club-Here-s-everything-you-need-to-know); [Zaleski 2024](https://mededu.jmir.org/2024/1/e51308).
3. **Campi obbligatori per ogni esercizio** in `scheda.json`: serie, range di ripetizioni, RIR target, recupero in secondi, cue tecnico, regolazioni dell'attrezzo, alternativa pre-approvata, incremento minimo dell'attrezzo. Fonti: [Havers 2025b](https://www.termedia.pl/A-professional-assessment-of-training-plans-for-muscle-hypertrophy-and-maximal-strength-developed-by-generative-artificial-intelligence,78,56339,1,1.html); [Washif 2024](https://rcastoragev2.blob.core.windows.net/1743a6e8fccaf0fac3449d126bbb6397/JBS-41-51817.PMC10955742.pdf); [Fitbod](https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout); [Alpha Progression](https://alphaprogression.com/en/blog/alpha-progression-vs-rp-hypertrophy).
4. **Checklist di accettazione** contro i difetti noti degli LLM: intensità presente su ogni esercizio, serie settimanali per gruppo muscolare calcolate, 2 sedute nel calendario e nessun giorno di riposo contato come seduta, riscaldamento e defaticamento presenti, test e metriche di monitoraggio definiti, obiettivi non mescolati. Fonti: [Havers 2024](https://www.termedia.pl/Reproducibility-and-quality-of-hypertrophy-related-training-plans-generated-by-GPT-4-and-Google-Gemini-as-evaluated-by-coaching-experts,78,55336,1,1.html); [Zaleski 2024](https://mededu.jmir.org/2024/1/e51308).
5. **Verifica del budget di tempo**: riscaldamento + Σ serie × (esecuzione + recupero) + cambi attrezzo + defaticamento ≤ 60 minuti, calcolato e riportato nella scheda. Fonti: [tatat fitness-coach](https://claudemarketplaces.com/skills/tatat/agents-playground/fitness-coach); [Fitbod, durata ↔ numero di esercizi](https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout). [I] per la formula.
6. **Catalogo chiuso** (Technogym App ∩ attrezzi Via Mantova) **con controllo dell'equilibrio tra schemi motori** (spinta e tirata orizzontale e verticale, accosciata, cerniera d'anca, core) in ogni seduta o nella settimana. Fonte: [PlanFitting](https://arxiv.org/html/2309.12555v2).
7. **Scheda modificata per diff motivato, mai rigenerata da zero**; il prompt di revisione include sempre profilo, scheda precedente, report del mese e linee guida. Fonte: [Havers 2024](https://www.termedia.pl/Reproducibility-and-quality-of-hypertrophy-related-training-plans-generated-by-GPT-4-and-Google-Gemini-as-evaluated-by-coaching-experts,78,55336,1,1.html).
8. **Progressione come regola condizionale verificabile** sui dati Mywellness: "se tutte le serie hanno raggiunto il tetto del range al RIR prescritto → +incremento minimo dell'attrezzo; altrimenti invariato; se l'incremento è troppo grande → prima le ripetizioni". Fonti: [wger](https://wger.readthedocs.io/en/latest/manual/routines.html); [Alpha Progression](https://alphaprogression.com/en/blog/alpha-progression-vs-rp-hypertrophy). Dettagli già nella ricerca precedente.
9. **Valutazione iniziale submassimale** (protocollo sotto): niente 1RM e niente serie a cedimento nelle prime 2 settimane, obbligatorio se ≥ 45 anni senza parere medico. Fonte: [PAR-Q+ 2025](https://southlake.ca/wp-content/uploads/2025/02/PARQPlus2025-Form-fillable.pdf). [I] per la calibrazione.
10. **Revisione mensile che guarda prima l'aderenza e la soddisfazione, poi i carichi**; con aderenza bassa si cambia la struttura, non la progressione. Fonti: [PlanFitting](https://arxiv.org/html/2309.12555v2); [Collado-Mateo 2021](https://www.mdpi.com/1660-4601/18/4/2023/htm).
11. **Fase abitudine nelle prime 6 settimane**: obiettivo 12/12 sedute, mai due sedute saltate di fila, giorni e fascia oraria fissi. Fonte: [Demirci 2025, preprint](https://arxiv.org/pdf/2501.01779).
12. **Segnali di stop e regola sul dolore**: un infortunio o un dolore porta a sostituire l'esercizio e a rendere più prudente la progressione, non solo ad aggiungere un avviso. Fonti: [revfactory](https://skillsmp.com/skills/revfactory-harness-100-en-74-fitness-program-claude-skills-fitness-program-skill-md); [ACSM, segni e sintomi](https://open-exam-prep.com/study-guides/acsm-cpt/chapter-2-health-screening/preparticipation-screening-algorithm).

### Priorità media

13. **Allenamenti A/B in sequenza, non a calendario**: la seduta saltata non si recupera, si esegue la successiva della sequenza. Fonte: [Hevy Trainer](https://help.hevyapp.com/hc/en-us/articles/38385724273047-Hevy-Trainer-Explained-How-It-Builds-Your-Workout-Program). **[C]**
14. **Regola di rientro**: dopo ≥ 10 giorni senza allenamento, prima seduta con carichi −10% e RIR 3–4. Fonte: [Dr. Muscle](https://dr-muscle.com/what-makes-dr-muscle-different/). **[C]**, da registrare in `kb/decisioni/`.
15. **Check-in pre-seduta di 4 voci** (sonno, stress, energia, indolenzimento, scala 1–5) collegato a una "seduta ridotta" predefinita (una serie in meno per esercizio), raccordato al semaforo del recupero della ricerca precedente. Fonte: [JuggernautAI](https://help.jtsstrength.com/en/articles/3-how-juggernautai-is-individualized-to-you). **[C]**
16. **RIR o RPE registrato almeno sull'ultima serie** di ogni esercizio come segnale per la progressione. Fonti: [JuggernautAI](https://help.jtsstrength.com/en/articles/3-how-juggernautai-is-individualized-to-you); [Fitbod](https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout). **[C]**
17. **Vocabolario chiuso delle decisioni di revisione**: mantieni, progredisci, scarica, sposta volume, sostituisci, riduci struttura; ciascuna con una riga di motivazione. Fonte: [strength-training-mcp](https://glama.ai/mcp/servers/daiduo2/strength-training-mcp).
18. **Contatore di stalli per esercizio**: dopo N sedute senza progresso (valore da fissare in `kb/decisioni/`) si valuta lo scarico o la sostituzione. Fonti: [Liftosaur](https://github.com/astashov/liftosaur); [Dr. Muscle](https://dr-muscle.com/what-makes-dr-muscle-different/). **[C]**
19. **Variante breve di ogni seduta** (circa 40 minuti, solo multiarticolari) come piano di riserva per le giornate compresse. Fonte: [PlanFitting](https://arxiv.org/html/2309.12555v2). [I] per la durata.
20. **Obiettivi di processo e di risultato separati**, entrambi SMART; quelli di risultato su un orizzonte di 12–16 settimane e come intervallo. Fonte: [Collado-Mateo 2021](https://www.mdpi.com/1660-4601/18/4/2023/htm). [I] per l'orizzonte.
21. **Giudizio sulla tecnica per esercizio** (scarsa, accettabile, buona): si sale di carico solo con tecnica almeno accettabile. Fonte: [Freeletics](https://www.freeletics.com/en/blog/posts/coach-feedback/). **[C]**
22. **Livello incerto → progettare per principiante e dichiararlo**; al massimo 2 iterazioni di correzione della bozza prima di sottoporla all'utente. Fonte: [revfactory](https://skillsmp.com/skills/revfactory-harness-100-en-74-fitness-program-claude-skills-fitness-program-skill-md). **[C]**

### Priorità bassa

23. **Etichette di preferenza** "di più / di meno / mai più" per esercizio, lette in revisione. Fonte: [Fitbod](https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout). **[C]**
24. **Priorità muscolari** (enfatizza, cresci, mantieni) nello schema: poco utili per un principiante in full body, da considerare dopo 3–6 mesi. Fonte: [RP via Alpha Progression](https://alphaprogression.com/en/blog/alpha-progression-vs-rp-hypertrophy). **[C]**
25. **Feedback per gruppo muscolare** (pump, indolenzimento residuo, carico percepito) che porta a ±1 serie a fine mese: troppo granulare oggi, utile più avanti. Fonte: [RP via Alpha Progression](https://alphaprogression.com/en/blog/alpha-progression-vs-rp-hypertrophy). **[C]**; domanda sul dolore articolare **[non verificato]**.
26. **Avviso se due sedute cadono a meno di 48 ore** l'una dall'altra. Fonte: [Fitbod](https://fitbod.me/blog/muscle-recovery/). **[C]**
27. **Non importare la logica di Technogym Coach**: usarlo solo come fonte di dati e catalogo esercizi. Fonte: [Technogym App](https://www.technogym.com/en-INT/technogym-app/). [I]
28. **Deload a regola sul calo dell'1RM stimato** (−50% serie, −10% carico) come alternativa allo scarico reattivo già scelto: tenerlo solo come confronto. Fonte: [Dr. Muscle](https://dr-muscle.com/what-makes-dr-muscle-different/). **[C]**

---

## Questionario profilo per l'utente

**Istruzioni.** Il questionario si compila una volta prima della Scheda v1. Le sezioni C, F e G si rivedono brevemente a ogni revisione mensile; il PAR-Q+ si ripete ogni anno e a ogni cambiamento dello stato di salute.

**Dati sanitari.** Rispondere alle domande sanitarie (sezioni A e B) è necessario, ma **ogni dettaglio sanitario è facoltativo**. Nel repository e nel Progetto si conserva **solo l'esito sì/no** di ciascuna domanda. Non si conservano diagnosi, nomi di farmaci, valori clinici o descrizioni di infortuni. Per la sezione B si registra solo il movimento da evitare o adattare, senza la causa. **Con qualunque "sì" nella sezione A, prima di iniziare o di aumentare l'intensità consultare il medico** (eventualmente con il supporto dell'ePARmed-X+); la visita per il certificato non agonistico è l'occasione naturale. Non allenarsi in caso di febbre o malattia in corso.

### A. Screening sanitario (PAR-Q+ 2024/2025, traduzione di lavoro, e sintomi ACSM)

| # | Domanda | Risposta |
| --- | --- | --- |
| A1 | Un medico ti ha mai detto che hai un problema cardiaco o la pressione alta? | sì / no |
| A2 | Senti dolore al petto a riposo, nelle attività quotidiane o durante l'attività fisica? | sì / no |
| A3 | Negli ultimi 12 mesi hai perso l'equilibrio per un capogiro o hai perso conoscenza? (rispondi "no" se il capogiro era dovuto a iperventilazione durante uno sforzo intenso) | sì / no |
| A4 | Ti è mai stata diagnosticata un'altra malattia cronica, diversa da cardiopatia o ipertensione? | sì / no |
| A5 | Prendi attualmente farmaci prescritti per una malattia cronica? | sì / no |
| A6 | Hai attualmente, o hai avuto negli ultimi 12 mesi, un problema a ossa, articolazioni o tessuti molli (muscoli, legamenti, tendini) che potrebbe peggiorare aumentando l'attività fisica? (rispondi "no" se un problema passato non limita più l'attività) | sì / no |
| A7 | Un medico ti ha mai detto che dovresti fare attività fisica solo sotto supervisione medica? | sì / no |
| A8 | Ti capita, anche fuori dalla palestra, di avere fiato corto per sforzi lievi, palpitazioni, gonfiore alle caviglie, dolore ai polpacci camminando che passa da fermo, o stanchezza insolita nelle attività abituali? | sì / no |
| A9 | Negli ultimi 12 mesi hai avuto un trauma cranico o una commozione cerebrale? | sì / no |
| A10 | La tua pressione a riposo è sotto 160/90 mmHg? ("non so" equivale a "da misurare prima di iniziare") | sì / no / non so |
| A11 | Hai 45 anni o più? (se sì: niente test massimali né serie a cedimento senza parere medico o di un professionista) | sì / no |
| A12 | Certificato per attività non agonistica: è valido? Data di scadenza? Il medico ha indicato limitazioni? | sì / no + data + sì / no |

Esito da registrare: "PAR-Q+ tutto no" oppure "almeno un sì → parere medico richiesto, data del parere"; scadenza del certificato; "limitazioni indicate dal medico: sì/no".

### B. Apparato muscolo-scheletrico (dettagli facoltativi)

| # | Domanda | Cosa si registra |
| --- | --- | --- |
| B1 | Hai avuto infortuni rilevanti (schiena, spalla, ginocchio, anca, caviglia, polso) o interventi a ossa e articolazioni? | sì / no |
| B2 | Oggi hai dolore in qualche zona durante i movimenti quotidiani? | sì / no |
| B3 | Ci sono movimenti che ti danno fastidio o che eviti (accosciata profonda, braccia sopra la testa, piegarti in avanti, spingere da sdraiato, saltare)? | elenco dei movimenti da evitare o adattare, senza causa |

### C. Stile di vita

1. Lavoro: quante ore al giorno stai seduto? Orari fissi, turni, trasferte, lavoro da remoto?
2. Movimento quotidiano: passi medi al giorno (se li misuri) o come ti sposti (auto, mezzi, a piedi, bici)?
3. Sonno: ore medie per notte, qualità da 1 a 5, orari regolari?
4. Stress attuale da 1 a 10, e la sua fonte principale (lavoro, famiglia, altro).
5. Fumo (sì/no) e alcol in una settimana tipica (nessuno, 1–3, 4–7, più di 7 bicchieri).
6. Alimentazione: pasti al giorno, chi cucina, pasti fuori casa, fonti proteiche abituali; diete già provate?
7. Peso negli ultimi 2 anni: stabile, in aumento o in calo?
8. Usi un wearable (orologio, anello, fascia cardio)? Quale, e sincronizza con la Technogym App?

### D. Storia di allenamento

1. Hai fatto sport o palestra in passato? Cosa, per quanto tempo, quando hai smesso e perché?
2. Negli ultimi 3 mesi hai fatto attività strutturata almeno 3 volte a settimana per 30 minuti a intensità moderata? (sì/no: criterio ACSM di "praticante")
3. Quali attrezzi o esercizi conosci già? Quali ti mettono a disagio?
4. Conosci già qualche carico (per esempio sulla leg press o sulla lat machine)? Indicalo solo se recente.
5. Hai già usato la Technogym App o Mywellness? Sai avviare un allenamento dall'app e registrare un esercizio su un attrezzo connesso?

### E. Obiettivi

1. Perché vuoi iniziare proprio ora? Cosa vorresti fosse diverso tra 3 mesi, e tra 12?
2. Obiettivo di risultato misurabile, da riformulare insieme in forma SMART (esempio: circonferenza vita −3/5 cm in 16 settimane).
3. Due o tre obiettivi di processo che dipendono solo da te (esempio: 2 sedute a settimana per 12 settimane; una fonte proteica a ogni pasto; un numero di passi al giorno).
4. Come capirai che sta funzionando, oltre alla bilancia (vestiti, energia, scale, sonno, umore)?

### F. Motivazione

1. Da 0 a 10, quanto è importante per te allenarti con costanza? Perché non un numero più basso?
2. Da 0 a 10, quanto sei sicuro di riuscire a fare 2 sedute a settimana per 3 mesi? Cosa ti porterebbe 2 punti più in alto?
3. Le volte precedenti, cosa ti ha fatto smettere?

### G. Disponibilità, preferenze e barriere

1. Quali due giorni e quale fascia oraria fissa puoi garantire? Scrivilo nella forma: "Quando è [giorno] alle [ora], vado a Via Mantova e faccio la seduta [A/B]".
2. Piano B: se salta una seduta, quando la sostituisci (esempio: "entro il giorno dopo, entro le 20")?
3. Tempo reale per seduta, esclusi spogliatoio e tragitto: 60 minuti pieni o meno?
4. Preferisci macchinari guidati, cavi o pesi liberi? Quale cardio preferisci (tapis roulant, bike, ellittica, vogatore)? Ti interessano nuoto o corsi?
5. C'è qualcosa che detesti fare in palestra (da escludere dalla scheda)?
6. Ostacoli prevedibili: lavoro serale, famiglia, viaggi, stanchezza, sala affollata in certe fasce?
7. Preferisci allenarti da solo o con qualcuno? Vuoi promemoria o riepiloghi dall'assistente, e con quale frequenza?

---

## Protocollo di valutazione iniziale

**Prerequisiti.** PAR-Q+ tutto "no" (o parere medico favorevole), certificato non agonistico valido, nessuna malattia in corso, pressione a riposo nota e sotto 160/90 mmHg. Con un valore pari o superiore, sentire il medico prima di iniziare (soglia PAR-Q+). Principio: test **submassimali**, eseguiti da soli, ripetuti identici a ogni rivalutazione. Conta il confronto con se stessi, non le tabelle normative. Le misure si registrano in `data/` secondo `kb/concetti/protocollo-bia.md`; il resto in una nota di valutazione.

### T0a: misure e test (settimana 0, una sessione dedicata)

| Blocco | Test | Procedura | Cosa si registra |
| --- | --- | --- | --- |
| Misure (mattina) | Peso, BIA InBody, circonferenza vita, altezza (una volta) | Secondo il protocollo BIA del repository (digiuno, vescica vuota, niente allenamento nelle 12 ore precedenti, stessa macchina). Vita all'ombelico con metro, 2 letture, media. Foto frontale, laterale e posteriore facoltative, stessa luce e posa | kg, % massa grassa, muscolo scheletrico, cm |
| Parametri a riposo | Pressione e FC a riposo | Pressione: 2 letture dopo 5 minuti seduto (farmacia o misuratore domestico). FC: al risveglio per 3 mattine, media (anche da wearable) | mmHg, bpm |
| Riscaldamento | 5–8 minuti di cardio leggero | Bike o tapis roulant a RPE 3–4 su 10 | — |
| Movimento | Overhead squat | 5 ripetizioni a ritmo naturale fino all'altezza di una sedia, braccia tese sopra la testa, scarpe piatte, video frontale e laterale. Osservare piedi che ruotano o si appiattiscono, ginocchia verso l'interno, busto troppo inclinato, lombare inarcata, braccia che cadono in avanti. Serve a scegliere varianti e riscaldamento, non è una diagnosi | compensi osservati (sì/no per voce) |
| Forza funzionale | Sit-to-stand 30 s | Sedia senza braccioli di circa 43 cm contro il muro, braccia incrociate sul petto, 1–2 prove di pratica, poi contare le alzate complete in 30 s. Variazione significativa: ≥ 2–3 ripetizioni | ripetizioni |
| Forza parte superiore | Push-up | Variante scelta a T0 (su panca inclinata, su ginocchia o completa) e mantenuta identica nelle rivalutazioni. Contare le ripetizioni con tecnica corretta, fermarsi alla prima ripetizione con tecnica persa, mai a cedimento. Norme per età **[non verificato]** | variante e ripetizioni |
| Core | Plank sugli avambracci | Tenuta fino alla perdita dell'allineamento (bacino che cede o sale) o a 120 s. Interrompere con dolore lombare | secondi |
| Cardio | Prova submassimale a protocollo fisso, 6 minuti | Tapis roulant (camminata svelta, pendenza 1–3%) o bike a carico fisso deciso a T0; RPE obiettivo ≤ 5–6 su 10. Ripetere identico a ogni rivalutazione: a parità di carico, FC e RPE più bassi indicano un miglioramento. Validità del test del cammino negli adulti sani **[non verificato]** | velocità/pendenza o watt, FC finale, FC a 1 minuto, RPE |

### T0b: calibrazione dei carichi (prime 2 sedute della scheda)

1. Per ogni attrezzo annotare le regolazioni (sedile, schienale, posizione delle leve) e l'incremento minimo disponibile.
2. Eseguire una serie da 12 ripetizioni molto leggera per imparare il movimento.
3. Fare serie di avvicinamento e poi serie da 10, salendo di uno step alla volta, finché la serie arriva a **RIR 3 nella settimana 1** e a **RIR 2 nella settimana 2**. Correggere di circa il 4% per ogni ripetizione fuori range (procedura dettagliata nella ricerca precedente). Quel carico diventa lo `start_load_kg`.
4. Nessun test di 1RM e nessuna serie a cedimento nelle prime 2 settimane. Il divieto è obbligatorio se A11 = sì e manca un parere medico.
5. Dopo ogni serie annotare RPE (0–10) e RIR stimato, confrontandoli con le tre parole della scheda (facile, giusto, al limite). Facoltativo: su un attrezzo sicuro, per esempio la leg press con fermi, verificare una volta il RIR stimato provando 1–2 ripetizioni in più. L'idea che i principianti sottostimino il RIR viene da conoscenza generale ed è **[non verificata]** in questa ricerca.

### Criteri di stop di sicurezza

Interrompere subito la seduta o il test e contattare un medico se compare uno di questi segnali. Se il segnale è grave o persiste, chiamare il 112 (o il 118).

- Dolore, oppressione o fastidio al petto, al braccio, alla mandibola o alla schiena.
- Fiato corto sproporzionato allo sforzo, che non si riprende con il riposo.
- Capogiro, sensazione di svenimento, confusione, perdita di coordinazione, disturbi visivi.
- Palpitazioni, battito irregolare o molto accelerato.
- Nausea, sudorazione fredda o pallore insoliti.
- Dolore articolare acuto o "a pugnalata", formicolii o perdita di forza a un arto, dolore lombare che si irradia alla gamba: interrompere l'esercizio e annotare il movimento. In revisione l'esercizio si sostituisce.

Regole di contorno:

- Con febbre o malattia in corso si rinvia la seduta.
- Dopo un cambiamento di salute si ricompila il PAR-Q+ prima di riprendere.
- Un indolenzimento muscolare che compare 24–72 ore dopo è normale nelle prime settimane. Un dolore articolare, o un dolore che peggiora di seduta in seduta, non lo è.

L'elenco combina i segni e sintomi ACSM ([Open Exam Prep](https://open-exam-prep.com/study-guides/acsm-cpt/chapter-2-health-screening/preparticipation-screening-algorithm)) con le indicazioni del PAR-Q+ ([PAR-Q+ 2025](https://southlake.ca/wp-content/uploads/2025/02/PARQPlus2025-Form-fillable.pdf)). L'elenco ACSM completo dei criteri di interruzione di un test da sforzo non è stato verificato **[non verificato]**.

### Cadenza di rivalutazione

| Cosa | Quando | Dove confluisce |
| --- | --- | --- |
| Peso, BIA, vita | Ogni 2 settimane nel primo ciclo, poi mensile, a protocollo BIA | `data/`, report mensile |
| Pressione e FC a riposo | Mensile (FC continua da wearable, se disponibile) | Report mensile |
| Check-in profilo (sezioni C, F, G) | A ogni revisione mensile, prima dei carichi | `reports/AAAA-MM-revisione.md` |
| Aderenza (sedute fatte su sedute previste) | A ogni revisione mensile; nelle prime 6 settimane obiettivo 12/12 | Report mensile |
| Test funzionali, cardio submassimale, video dell'overhead squat | Ogni 8–12 settimane, stessa ora e stesse condizioni di T0 | Revisione del mese corrispondente |
| Calibrazione dei carichi | Solo per un esercizio nuovo o dopo una pausa ≥ 10 giorni (rientro a −10%) **[C]** | `scheda.json` |
| PAR-Q+ e certificato | Ogni anno o a ogni cambiamento dello stato di salute; segnalare la scadenza del certificato un mese prima | Profilo |
