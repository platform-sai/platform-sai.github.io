'use strict';

(() => {
  const { icone, esc, nombre, pourcent, ratio, date, ilYa, programme, api, toast, compter, session } = window.SAI;

  const $ = (id) => document.getElementById(id);
  const el = {
    nbRecus: $('nb-recus'),
    nbAttendus: $('nb-attendus'),
    segments: $('segments'),
    dernier: $('dernier'),
    totaux: $('totaux'),
    totauxMission: $('totaux-mission'),
    tuiles: $('tuiles'),
    grapheZone: $('graphe-zone'),
    graphe: $('graphe'),
    tableVue: $('table-vue'),
    sousTitreBase: $('sous-titre-base'),
    tableHistorique: $('table-historique'),
    tableCoordinateurs: $('table-coordinateurs'),
    badgeHistorique: $('badge-historique'),
    direct: $('direct'),
    infobulle: $('infobulle'),
    rechercheVue: $('recherche-vue'),
    rechercheHistorique: $('recherche-historique'),
    segmentPopulation: $('segment-population'),
    segmentStatut: $('segment-statut'),
    dialogueCoordinateur: $('dialogue-coordinateur'),
    formCoordinateur: $('form-coordinateur'),
    titreDialogueCoordinateur: $('titre-dialogue-coordinateur'),
    boutonEnregistrer: $('enregistrer-coordinateur'),
    dialogueConfirmation: $('dialogue-confirmation'),
    texteConfirmation: $('texte-confirmation'),
    boutonConfirmer: $('confirmer-suppression'),
  };
  const onglets = [...document.querySelectorAll('[role="tab"]')];

  const etat = {
    donnees: null,
    premierRendu: true,
    population: 'total',
    statut: 'tous',
    role: 'tous',
    rechercheVue: '',
    rechercheHistorique: '',
    tri: { cle: 'programme', sens: 1 },
    programmesSurligner: new Set(),
    rapportsSurligner: new Set(),
    lignesGraphe: [],
    infobulleIndex: null,
    coordinateurEdite: null,
    rapportASupprimer: null,
  };

  const SEM = { cle: 'sem', titre: 'Séminaire', icone: 'livre' };
  const INST = { cle: 'inst', titre: 'Institut', icone: 'diplome' };
  const RAE = { cle: 'rae', titre: "Réussir à l'école", icone: 'cible' };
  const MIS = { cle: 'mis', titre: 'Préparation missionnaire', icone: 'globe' };
  const GROUPES = [SEM, INST, RAE, MIS];

  // Colonnes chiffrées communes à la base de données et à l'historique.
  const COLONNES_CHIFFRES = [
    { cle: 'sem_instructeurs', titre: 'Instructeurs', groupe: SEM, debut: true },
    { cle: 'sem_inscrits', titre: 'Inscrits', groupe: SEM },
    { cle: 'sem_presents', titre: 'Assistent', groupe: SEM, den: 'sem_inscrits' },
    { cle: 'sem_convertis_inscrits', titre: 'Convertis', groupe: SEM },
    { cle: 'sem_remotives', titre: 'Remotivés', groupe: SEM },
    { cle: 'sem_classes', titre: 'Classes', groupe: SEM, classes: ['sem_classes_ouvertes', 'sem_classes_a_ouvrir'] },
    { cle: 'inst_instructeurs', titre: 'Instructeurs', groupe: INST, debut: true },
    { cle: 'inst_inscrits', titre: 'Inscrits', groupe: INST },
    { cle: 'inst_presents', titre: 'Assistent', groupe: INST, den: 'inst_inscrits' },
    { cle: 'inst_convertis_inscrits', titre: 'Convertis', groupe: INST },
    { cle: 'inst_remotives', titre: 'Remotivés', groupe: INST },
    { cle: 'inst_classes', titre: 'Classes', groupe: INST, classes: ['inst_classes_ouvertes', 'inst_classes_a_ouvrir'] },
    { cle: 'rae_classes', titre: 'Classes', groupe: RAE, debut: true, classes: ['rae_classes_ouvertes', 'rae_classes_a_ouvrir'] },
    { cle: 'mis_prep_inscrits', titre: 'Inscrits', groupe: MIS, debut: true },
  ];

  // Bande « Mission et réactivation ». Les rapports envoyés avant l'ajout de ces questions n'y
  // répondent pas (null) : chaque indicateur dit combien de programmes l'ont renseigné.
  const INDICATEURS_MISSION = [
    { cle: 'prep', label: 'Étudiants en préparation missionnaire', detail: 'Inscrits dans les classes de préparation missionnaire', champs: ['mis_prep_inscrits'] },
    { cle: 'convertis', label: 'Nouveaux convertis inscrits', detail: "Au Séminaire et à l'Institut", champs: ['sem_convertis_inscrits', 'inst_convertis_inscrits'], repartition: true },
    { cle: 'remotives', label: 'Membres inactifs remotivés', detail: 'Dans la semaine, selon le dernier rapport de chaque programme', champs: ['sem_remotives', 'inst_remotives'], repartition: true },
  ];

  const somme = (r, ...cles) => cles.reduce((total, cle) => total + r[cle], 0);
  const collator = new Intl.Collator('fr', { sensitivity: 'base' });
  const libelle = (nomProgramme) => programme(nomProgramme).libelle;
  const lignesTriees = () => [...etat.donnees.vue].sort((a, b) => collator.compare(libelle(a.programme), libelle(b.programme)));
  const mouvement = () => (window.SAI.mouvementReduit() ? 'auto' : 'smooth');

  /* ================================================================ Données */

  let chargementEnCours = false;
  let rechargerEnsuite = false;

  function retourConnexion() {
    session.effacer();
    window.location.replace('connexion.html');
  }

  // Rapports arrivés depuis le chargement précédent : surlignés quelques secondes et annoncés.
  function signalerNouveaux(rapports) {
    if (!etat.donnees) return;
    const dernierConnu = Math.max(0, ...etat.donnees.rapports.map((r) => r.id));
    for (const r of rapports.filter((rapport) => rapport.id > dernierConnu).reverse()) {
      surligner(etat.programmesSurligner, r.programme);
      surligner(etat.rapportsSurligner, r.id);
      toast(`Rapport reçu : ${libelle(r.programme)}, envoyé par ${r.coordinateur_nom}.`, 'succes', 6000);
    }
  }

  async function rafraichir() {
    if (chargementEnCours) {
      rechargerEnsuite = true;
      return;
    }
    chargementEnCours = true;
    try {
      const donnees = await api('/api/admin/donnees');
      signalerNouveaux(donnees.rapports);
      etat.donnees = donnees;
      rendre();
      etat.premierRendu = false;
    } catch (err) {
      if (err.statut === 401) {
        retourConnexion();
        return;
      }
      toast(err.message, 'erreur');
    } finally {
      chargementEnCours = false;
      if (rechargerEnsuite) {
        rechargerEnsuite = false;
        rafraichir();
      }
    }
  }

  // Regroupe les demandes rapprochées (événement temps réel + action locale) en un seul chargement.
  let minuterieRafraichissement;
  function planifierRafraichissement() {
    clearTimeout(minuterieRafraichissement);
    minuterieRafraichissement = setTimeout(rafraichir, 150);
  }

  function rendre() {
    rendreAppel();
    rendreTotaux();
    rendreMission();
    rendreTuiles();
    rendreGraphe();
    rendreTableVue();
    rendreHistorique();
    rendreCoordinateurs();
  }

  // Le surlignage vit quelques secondes, quel que soit le nombre de rendus entre-temps.
  function surligner(ensemble, cle) {
    ensemble.add(cle);
    setTimeout(() => ensemble.delete(cle), 4000);
  }

  function animerBarres(racine) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const barre of racine.querySelectorAll('[data-largeur]')) barre.style.width = `${barre.dataset.largeur}%`;
    }));
  }

  /* ================================================================ En-tête : l'appel */

  function rendreAppel() {
    const { totaux, rapports } = etat.donnees;
    compter(el.nbRecus, totaux.recus);
    el.nbAttendus.textContent = nombre(totaux.attendus);
    el.badgeHistorique.textContent = nombre(rapports.length);

    const lignes = lignesTriees();
    el.segments.style.setProperty('--n', String(Math.max(1, lignes.length)));
    el.segments.classList.toggle('premier-rendu', etat.premierRendu);
    el.segments.innerHTML = lignes.map((l, i) => {
      const nouveau = etat.programmesSurligner.has(l.programme);
      const titre = `${libelle(l.programme)} : ${l.rapport ? 'reçu' : 'en attente'}`;
      return `<span class="segment-prog${l.rapport ? ' is-recu' : ''}${nouveau ? ' is-nouveau' : ''}" style="--i:${i}" title="${esc(titre)}"></span>`;
    }).join('');

    const dernier = rapports[0];
    el.dernier.innerHTML = dernier
      ? `Dernier rapport : <strong>${esc(libelle(dernier.programme))}</strong>, envoyé par ${esc(dernier.coordinateur_nom)} ${esc(ilYa(dernier.soumis_le))}.`
      : 'Aucun rapport pour l’instant. Copiez le lien du formulaire et envoyez-le aux coordonnateurs et aux instructeurs.';
  }

  function majDirect(etatConnexion) {
    el.direct.dataset.etat = etatConnexion;
    el.direct.querySelector('.direct__texte').textContent = etatConnexion === 'ok' ? 'En direct' : 'Reconnexion';
    el.direct.title = etatConnexion === 'ok' ? 'Les nouveaux rapports apparaissent sans recharger la page' : 'Connexion en direct interrompue, nouvelle tentative en cours';
  }

  /* ================================================================ Totaux */

  function rendreTotaux() {
    const t = etat.donnees.totaux;
    if (!el.totaux.childElementCount) {
      el.totaux.innerHTML = `
        <div class="total" data-total="inscrits">
          <p class="total__label">Étudiants inscrits</p>
          <p class="total__valeur" data-valeur>0</p>
          <div class="repartition" aria-hidden="true"><span class="teinte-sem"></span><span class="teinte-inst"></span></div>
          <p class="repartition__legende"></p>
        </div>
        <div class="total" data-total="presents">
          <p class="total__label">Étudiants qui assistent</p>
          <p class="total__valeur" data-valeur>0</p>
          <p class="total__detail"></p>
          <div class="repartition" aria-hidden="true"><span class="teinte-sem"></span><span class="teinte-inst"></span></div>
          <p class="repartition__legende"></p>
        </div>
        <div class="total" data-total="instructeurs">
          <p class="total__label">Instructeurs</p>
          <p class="total__valeur" data-valeur>0</p>
          <div class="repartition" aria-hidden="true"><span class="teinte-sem"></span><span class="teinte-inst"></span></div>
          <p class="repartition__legende"></p>
        </div>
        <div class="total" data-total="classes">
          <p class="total__label">Classes ouvertes</p>
          <p class="total__valeur"><span data-valeur>0</span> <small></small></p>
          <div class="mini-jauges"></div>
        </div>`;
    }

    const repartir = (cle, sem, inst) => {
      const bloc = el.totaux.querySelector(`[data-total="${cle}"]`);
      const total = sem + inst;
      const [barreSem, barreInst] = bloc.querySelectorAll('.repartition span');
      barreSem.style.width = `${total ? (sem / total) * 100 : 0}%`;
      barreInst.style.width = `${total ? (inst / total) * 100 : 0}%`;
      bloc.querySelector('.repartition__legende').innerHTML = `
        <span class="teinte-sem"><i></i>Séminaire <b>${nombre(sem)}</b></span>
        <span class="teinte-inst"><i></i>Institut <b>${nombre(inst)}</b></span>`;
      compter(bloc.querySelector('[data-valeur]'), total);
      return bloc;
    };

    repartir('inscrits', t.sem_inscrits, t.inst_inscrits);
    const blocPresents = repartir('presents', t.sem_presents, t.inst_presents);
    const inscrits = t.sem_inscrits + t.inst_inscrits;
    blocPresents.querySelector('.total__detail').textContent = inscrits
      ? `${pourcent(t.sem_presents + t.inst_presents, inscrits)} des inscrits`
      : 'En attente des premiers rapports';
    repartir('instructeurs', t.sem_instructeurs, t.inst_instructeurs);

    const ouvertes = t.sem_classes_ouvertes + t.inst_classes_ouvertes + t.rae_classes_ouvertes;
    const aOuvrir = t.sem_classes_a_ouvrir + t.inst_classes_a_ouvrir + t.rae_classes_a_ouvrir;
    const blocClasses = el.totaux.querySelector('[data-total="classes"]');
    compter(blocClasses.querySelector('[data-valeur]'), ouvertes);
    blocClasses.querySelector('small').textContent = `sur ${nombre(aOuvrir)}`;
    blocClasses.querySelector('.mini-jauges').innerHTML = [RAE, SEM, INST].map((g) => {
      const o = t[`${g.cle}_classes_ouvertes`];
      const a = t[`${g.cle}_classes_a_ouvrir`];
      return `
        <div class="jauge mini-jauge teinte-${g.cle}">
          <div class="jauge__tete"><span>${g.titre}</span><span><b>${nombre(o)}</b> sur ${nombre(a)}</span></div>
          <div class="jauge__piste" role="img" aria-label="${esc(`${g.titre} : ${o} classes ouvertes sur ${a}`)}"><div class="jauge__barre" data-largeur="${Math.min(1, ratio(o, a) || 0) * 100}"></div></div>
        </div>`;
    }).join('');
    animerBarres(blocClasses);
  }

  /* ================================================================ Mission et réactivation */

  function rendreMission() {
    const t = etat.donnees.totaux;
    if (!el.totauxMission.childElementCount) {
      el.totauxMission.innerHTML = `
        <p class="totaux__titre">${icone('globe')}<span>Mission et réactivation</span></p>
        ${INDICATEURS_MISSION.map((ind) => `
          <div class="total" data-mission="${ind.cle}">
            <p class="total__label">${ind.label}</p>
            <p class="total__valeur" data-valeur>0</p>
            <p class="total__note">${ind.detail}</p>
            ${ind.repartition ? `
              <div class="repartition" aria-hidden="true"><span class="teinte-sem"></span><span class="teinte-inst"></span></div>
              <p class="repartition__legende"></p>` : ''}
            <p class="total__couverture" hidden></p>
          </div>`).join('')}`;
    }
    for (const ind of INDICATEURS_MISSION) {
      const bloc = el.totauxMission.querySelector(`[data-mission="${ind.cle}"]`);
      const valeurs = ind.champs.map((c) => t[c]);
      compter(bloc.querySelector('[data-valeur]'), valeurs.reduce((a, b) => a + b, 0));
      if (ind.repartition) {
        const [sem, inst] = valeurs;
        const [barreSem, barreInst] = bloc.querySelectorAll('.repartition span');
        barreSem.style.width = `${sem + inst ? (sem / (sem + inst)) * 100 : 0}%`;
        barreInst.style.width = `${sem + inst ? (inst / (sem + inst)) * 100 : 0}%`;
        bloc.querySelector('.repartition__legende').innerHTML = `
          <span class="teinte-sem"><i></i>Séminaire <b>${nombre(sem)}</b></span>
          <span class="teinte-inst"><i></i>Institut <b>${nombre(inst)}</b></span>`;
      }
      // Sur combien de programmes porte ce total ? (les rapports antérieurs à la question n'y répondent pas)
      const renseignes = Math.min(...ind.champs.map((c) => t.renseignes?.[c] ?? 0));
      const couverture = bloc.querySelector('.total__couverture');
      couverture.hidden = !t.recus || renseignes >= t.recus;
      couverture.textContent = `Renseigné par ${nombre(renseignes)} des ${nombre(t.recus)} programmes reçus`;
    }
  }

  /* ================================================================ Appel des programmes (tuiles) */

  function rendreTuiles() {
    el.tuiles.innerHTML = lignesTriees().map((l) => {
      const r = l.rapport;
      const nouveau = etat.programmesSurligner.has(l.programme);
      const statut = r
        ? `${icone('coche')}Reçu ${esc(ilYa(r.soumis_le))}`
        : `${icone('horloge')}En attente`;
      return `
        <button type="button" class="tuile${r ? ' is-recu' : ' is-attente'}${nouveau ? ' is-nouveau' : ''}" data-programme="${esc(l.programme)}">
          <span class="tuile__nom">${esc(libelle(l.programme))}</span>
          <span class="tuile__coord">${esc(l.coordinateur_nom)}</span>
          <span class="tuile__statut">${statut}</span>
        </button>`;
    }).join('');
  }

  el.tuiles.addEventListener('click', (e) => {
    const tuile = e.target.closest('[data-programme]');
    if (!tuile) return;
    etat.rechercheVue = libelle(tuile.dataset.programme);
    el.rechercheVue.value = etat.rechercheVue;
    choisirStatut('tous');
    choisirOnglet('base');
    document.querySelector('.onglets').scrollIntoView({ behavior: mouvement(), block: 'start' });
  });

  /* ================================================================ Graphique */

  function rendreGraphe() {
    const pop = etat.population;
    el.grapheZone.className = `graphe-zone pop-${pop}`;
    const effectif = (r, suffixe) => (pop === 'total' ? somme(r, `sem_${suffixe}`, `inst_${suffixe}`) : r[`${pop}_${suffixe}`]);
    const lignes = etat.donnees.vue
      .filter((l) => l.rapport)
      .map((l) => ({ ligne: l, inscrits: effectif(l.rapport, 'inscrits'), presents: effectif(l.rapport, 'presents') }))
      .sort((a, b) => b.inscrits - a.inscrits || b.presents - a.presents);
    etat.lignesGraphe = lignes;
    cacherInfobulle();

    if (!lignes.length) {
      el.graphe.innerHTML = `
        <div class="vide">
          <strong>Aucun rapport pour l'instant</strong>
          <span>Les effectifs de chaque programme s'afficheront ici dès le premier envoi.</span>
          <button type="button" class="btn btn--primary btn--sm" data-copier-lien>${icone('lien')}Copier le lien du formulaire</button>
        </div>`;
      return;
    }

    const max = Math.max(1, ...lignes.map((x) => Math.max(x.inscrits, x.presents)));
    el.graphe.innerHTML = lignes.map((x, i) => {
      const p = programme(x.ligne.programme);
      const description = `${p.libelle} : ${x.inscrits} inscrits, ${x.presents} qui assistent`;
      return `
        <div class="graphe__ligne" tabindex="0" data-index="${i}" aria-label="${esc(description)}">
          <div class="graphe__libelle">
            <span class="graphe__prog">${esc(p.libelle)}</span>
            <span class="graphe__coord">${esc(x.ligne.coordinateur_nom)}</span>
          </div>
          <div class="graphe__piste" aria-hidden="true">
            <div class="graphe__barre graphe__barre--inscrits" data-largeur="${(x.inscrits / max) * 100}"></div>
            <div class="graphe__barre graphe__barre--presents" data-largeur="${(x.presents / max) * 100}"></div>
          </div>
          <div class="graphe__valeur" aria-hidden="true"><strong>${nombre(x.presents)}</strong> sur ${nombre(x.inscrits)}</div>
        </div>`;
    }).join('');
    animerBarres(el.graphe);
  }

  function montrerInfobulle(ligne, x, y) {
    const index = Number(ligne.dataset.index);
    const d = etat.lignesGraphe[index];
    if (!d) return;
    if (etat.infobulleIndex !== index) {
      etat.infobulleIndex = index;
      const p = programme(d.ligne.programme);
      el.infobulle.innerHTML = `
        <strong>${esc(p.libelle)}</strong>
        <div class="infobulle__coord">${esc(d.ligne.coordinateur_nom)}${p.code ? `, ${esc(p.code)}` : ''}</div>
        <div class="infobulle__ligne"><i style="background:var(--clair)"></i>Inscrits<b>${nombre(d.inscrits)}</b></div>
        <div class="infobulle__ligne"><i style="background:var(--fonce)"></i>Qui assistent<b>${nombre(d.presents)}</b></div>
        <div class="infobulle__ligne"><i></i>Taux d'assistance<b>${pourcent(d.presents, d.inscrits)}</b></div>`;
    }
    // Les pastilles lisent les couleurs de la population affichée
    el.infobulle.className = `infobulle pop-${etat.population}`;
    el.infobulle.style.setProperty('--clair', getComputedStyle(el.grapheZone).getPropertyValue('--clair'));
    el.infobulle.style.setProperty('--fonce', getComputedStyle(el.grapheZone).getPropertyValue('--fonce'));
    el.infobulle.hidden = false;
    const { width, height } = el.infobulle.getBoundingClientRect();
    const gauche = Math.min(window.innerWidth - width - 12, Math.max(12, x + 16));
    const haut = y - height - 14 < 12 ? y + 20 : y - height - 14;
    el.infobulle.style.left = `${gauche}px`;
    el.infobulle.style.top = `${haut}px`;
  }

  function cacherInfobulle() {
    el.infobulle.hidden = true;
    etat.infobulleIndex = null;
  }

  el.graphe.addEventListener('pointermove', (e) => {
    const ligne = e.target.closest('.graphe__ligne');
    if (ligne) montrerInfobulle(ligne, e.clientX, e.clientY);
    else cacherInfobulle();
  });
  el.graphe.addEventListener('pointerleave', cacherInfobulle);
  el.graphe.addEventListener('focusin', (e) => {
    const ligne = e.target.closest('.graphe__ligne');
    if (!ligne) return;
    const r = ligne.getBoundingClientRect();
    montrerInfobulle(ligne, r.left + r.width / 2, r.top);
  });
  el.graphe.addEventListener('focusout', cacherInfobulle);
  window.addEventListener('scroll', cacherInfobulle, { passive: true });

  el.segmentPopulation.addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-population]');
    if (!bouton) return;
    etat.population = bouton.dataset.population;
    for (const b of el.segmentPopulation.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === bouton));
    rendreGraphe();
  });

  /* ================================================================ Cellules partagées des tableaux */

  function celluleProgramme(nomProgramme, coordinateur, type) {
    const p = programme(nomProgramme);
    const details = [coordinateur, p.code, type === 'affilie' ? 'affilié' : null].filter(Boolean).join(', ');
    return `<td class="fige"><div class="cellule-prog"><strong>${esc(p.libelle)}</strong><span>${esc(details)}</span></div></td>`;
  }

  function celluleChiffre(r, col) {
    const classe = `num${col.debut ? ' debut-groupe' : ''}`;
    if (!r) return `<td class="${classe}">–</td>`;
    if (col.classes) {
      const [ouvertes, aOuvrir] = col.classes;
      return `<td class="${classe}" title="Classes ouvertes sur classes à ouvrir">${nombre(r[ouvertes])} sur ${nombre(r[aOuvrir])}<span class="sous-valeur">${pourcent(r[ouvertes], r[aOuvrir])}</span></td>`;
    }
    if (r[col.cle] === null || r[col.cle] === undefined) {
      return `<td class="${classe}" title="Chiffre pas encore demandé lors de cet envoi">–</td>`;
    }
    if (col.den) {
      const anomalie = r[col.cle] > r[col.den]
        ? `<span class="alerte-cellule" title="Plus d'étudiants qui assistent que d'inscrits">${icone('alerte')}</span>`
        : '';
      return `<td class="${classe}">${anomalie}${nombre(r[col.cle])}<span class="sous-valeur">${pourcent(r[col.cle], r[col.den])}</span></td>`;
    }
    return `<td class="${classe}">${nombre(r[col.cle])}</td>`;
  }

  function thTri(col, attributs = '') {
    const classes = [col.fige && 'fige', col.num && 'num', col.debut && 'debut-groupe'].filter(Boolean).join(' ');
    if (!col.triable) return `<th ${attributs} class="${classes}" scope="col">${col.titre}</th>`;
    const tri = etat.tri.cle === col.cle ? (etat.tri.sens > 0 ? 'ascending' : 'descending') : 'none';
    return `<th ${attributs} class="${classes}" scope="col" aria-sort="${tri}"><button type="button" class="trier" data-tri="${col.cle}">${col.titre}</button></th>`;
  }

  function enteteGroupes(avant, apres, triable = false) {
    const ligne1 = [
      ...avant.map((c) => thTri(c, 'rowspan="2"')),
      ...GROUPES.map((g) => `<th class="groupe teinte-${g.cle}" colspan="${COLONNES_CHIFFRES.filter((c) => c.groupe === g).length}" scope="colgroup">${g.titre}</th>`),
      ...apres.map((c) => thTri(c, 'rowspan="2"')),
    ];
    const ligne2 = COLONNES_CHIFFRES.map((c) => thTri({ ...c, num: true, triable }));
    return `<thead><tr>${ligne1.join('')}</tr><tr>${ligne2.join('')}</tr></thead>`;
  }

  function correspond(texte, recherche) {
    if (!recherche) return true;
    const normaliser = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    return normaliser(texte).includes(normaliser(recherche));
  }

  /* ================================================================ Base de données (dernier rapport par programme) */

  const COLONNE_PROGRAMME = { cle: 'programme', titre: 'Programme et responsable', fige: true, triable: true };
  const COLONNE_STATUT = { cle: 'maj', titre: 'Statut', debut: true, triable: true };

  function valeurTri(ligne, cle) {
    const r = ligne.rapport;
    if (cle === 'programme') return libelle(ligne.programme).toLowerCase();
    if (cle === 'maj') return r ? r.soumis_le : '';
    const col = COLONNES_CHIFFRES.find((c) => c.cle === cle);
    if (!r || !col) return -1;
    return col.classes ? r[col.classes[0]] : (r[cle] ?? -1);
  }

  function rendreTableVue() {
    const { vue, totaux } = etat.donnees;
    const lignes = vue
      .filter((l) => etat.statut === 'tous' || (etat.statut === 'recu' ? l.rapport : !l.rapport))
      .filter((l) => correspond(`${l.programme} ${l.coordinateur_nom}`, etat.rechercheVue))
      .sort((a, b) => {
        const va = valeurTri(a, etat.tri.cle);
        const vb = valeurTri(b, etat.tri.cle);
        return (va < vb ? -1 : va > vb ? 1 : 0) * etat.tri.sens;
      });

    const enAttente = totaux.attendus - totaux.recus;
    el.sousTitreBase.textContent = `${nombre(totaux.recus)} reçu${totaux.recus > 1 ? 's' : ''} et ${nombre(enAttente)} en attente. ${nombre(lignes.length)} affiché${lignes.length > 1 ? 's' : ''}.`;

    const entete = enteteGroupes([COLONNE_PROGRAMME], [COLONNE_STATUT], true);
    const corps = lignes.length
      ? lignes.map((l) => {
        const r = l.rapport;
        const nouveau = etat.programmesSurligner.has(l.programme);
        const statut = r
          ? `<span class="pill pill--good">${icone('coche')}Reçu</span><span class="sous-valeur" title="${esc(date(r.soumis_le))}">${esc(ilYa(r.soumis_le))}</span>`
          : `<span class="pill pill--warn">${icone('horloge')}En attente</span>`;
        return `
          <tr class="${r ? '' : 'is-attente'}${nouveau ? ' is-nouveau' : ''}">
            ${celluleProgramme(l.programme, l.coordinateur_nom, l.programme_type)}
            ${COLONNES_CHIFFRES.map((c) => celluleChiffre(r, c)).join('')}
            <td class="debut-groupe cellule-statut">${statut}</td>
          </tr>`;
      }).join('')
      : `<tr class="table-vide"><td colspan="${COLONNES_CHIFFRES.length + 2}">Aucun programme ne correspond. Effacez la recherche ou choisissez « Tous ».</td></tr>`;

    const recues = lignes.filter((l) => l.rapport);
    const total = {};
    for (const cle of etat.donnees.champs) total[cle] = recues.reduce((s, l) => s + (l.rapport[cle] ?? 0), 0);
    const pied = recues.length
      ? `<tfoot><tr>
          <td class="fige">Total de ${nombre(recues.length)} programme${recues.length > 1 ? 's' : ''}</td>
          ${COLONNES_CHIFFRES.map((c) => celluleChiffre(total, c)).join('')}
          <td class="debut-groupe"></td>
        </tr></tfoot>`
      : '';

    el.tableVue.innerHTML = `${entete}<tbody>${corps}</tbody>${pied}`;
  }

  el.tableVue.addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-tri]');
    if (!bouton) return;
    const cle = bouton.dataset.tri;
    etat.tri = { cle, sens: etat.tri.cle === cle ? -etat.tri.sens : (cle === 'programme' ? 1 : -1) };
    rendreTableVue();
    el.tableVue.querySelector(`[data-tri="${cle}"]`)?.focus();
  });

  el.rechercheVue.addEventListener('input', () => {
    etat.rechercheVue = el.rechercheVue.value.trim();
    rendreTableVue();
  });

  function choisirStatut(statut) {
    etat.statut = statut;
    for (const b of el.segmentStatut.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.statut === statut));
    if (etat.donnees) rendreTableVue();
  }

  el.segmentStatut.addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-statut]');
    if (bouton) choisirStatut(bouton.dataset.statut);
  });

  /* ================================================================ Historique */

  function rendreHistorique() {
    const { rapports } = etat.donnees;
    // Rapports triés du plus récent au plus ancien : le premier vu pour un programme est sa version actuelle.
    const vus = new Set();
    const actuels = new Set();
    for (const r of rapports) {
      if (vus.has(r.programme)) continue;
      vus.add(r.programme);
      actuels.add(r.id);
    }
    const lignes = rapports.filter((r) => correspond(`${r.programme} ${r.coordinateur_nom} ${r.commentaire || ''}`, etat.rechercheHistorique));

    const entete = enteteGroupes(
      [{ cle: 'programme', titre: 'Programme et responsable', fige: true }, { cle: 'date', titre: 'Envoyé le' }],
      [{ cle: 'commentaire', titre: 'Commentaire', debut: true }, { cle: 'actions', titre: '<span class="sr-only">Actions</span>' }],
    );
    const corps = lignes.length
      ? lignes.map((r) => {
        const actuel = actuels.has(r.id);
        const nouveau = etat.rapportsSurligner.has(r.id);
        return `
          <tr class="${nouveau ? 'is-nouveau' : ''}">
            ${celluleProgramme(r.programme, r.coordinateur_nom, r.programme_type)}
            <td><span class="horodatage">${esc(date(r.soumis_le))}</span>
              ${actuel ? `<span class="pill pill--good">${icone('coche')}Version actuelle</span>` : '<span class="sous-valeur">Remplacé par un envoi plus récent</span>'}</td>
            ${COLONNES_CHIFFRES.map((c) => celluleChiffre(r, c)).join('')}
            <td class="debut-groupe commentaire-cellule">${r.commentaire ? esc(r.commentaire) : '<span class="sous-valeur">Aucun</span>'}</td>
            <td><div class="actions-ligne">
              <button type="button" class="btn btn--table danger" data-supprimer="${r.id}" aria-label="Supprimer ce rapport" title="Supprimer ce rapport">${icone('corbeille')}</button>
            </div></td>
          </tr>`;
      }).join('')
      : `<tr class="table-vide"><td colspan="${COLONNES_CHIFFRES.length + 4}">${rapports.length ? 'Aucun envoi ne correspond à cette recherche.' : 'Aucun rapport reçu pour l’instant.'}</td></tr>`;

    el.tableHistorique.innerHTML = `${entete}<tbody>${corps}</tbody>`;
  }

  el.rechercheHistorique.addEventListener('input', () => {
    etat.rechercheHistorique = el.rechercheHistorique.value.trim();
    rendreHistorique();
  });

  el.tableHistorique.addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-supprimer]');
    if (!bouton) return;
    const rapport = etat.donnees.rapports.find((r) => r.id === Number(bouton.dataset.supprimer));
    if (!rapport) return;
    etat.rapportASupprimer = rapport;
    el.texteConfirmation.textContent = `Le rapport de ${libelle(rapport.programme)} envoyé par ${rapport.coordinateur_nom} le ${date(rapport.soumis_le)} sera supprimé définitivement. S'il s'agit de la version actuelle, l'envoi précédent de ce programme reprend sa place.`;
    el.dialogueConfirmation.showModal();
  });

  el.boutonConfirmer.addEventListener('click', async () => {
    const rapport = etat.rapportASupprimer;
    if (!rapport) return;
    el.boutonConfirmer.disabled = true;
    try {
      await api(`/api/admin/rapports/${rapport.id}`, { method: 'DELETE' });
      el.dialogueConfirmation.close();
      toast('Rapport supprimé.', 'succes');
      planifierRafraichissement();
    } catch (err) {
      toast(err.message, 'erreur');
    } finally {
      el.boutonConfirmer.disabled = false;
      etat.rapportASupprimer = null;
    }
  });

  /* ================================================================ Coordonnateurs et instructeurs */

  // Même règle que le serveur : « … IN » = instructeur ; « … CR » ou sans mention = coordonnateur.
  const roleSelonProgramme = (nomProgramme) => (/\bIN\b/.test(nomProgramme) ? 'Instructeur' : 'Coordonnateur');
  const pluriel = (n, singulier, forme = `${singulier}s`) => `${nombre(n)} ${n > 1 ? forme : singulier}`;

  function rendreCoordinateurs() {
    const { coordinateurs, rapports } = etat.donnees;
    const dernierEnvoi = new Map();
    for (const r of rapports) if (!dernierEnvoi.has(r.coordinateur_id)) dernierEnvoi.set(r.coordinateur_id, r.soumis_le);

    const actifs = coordinateurs.filter((c) => c.actif);
    const compte = (role) => actifs.filter((c) => c.role === role).length;
    const inactifs = coordinateurs.length - actifs.length;
    $('sous-titre-equipe').textContent = `${pluriel(compte('Coordonnateur'), 'coordonnateur')} et ${pluriel(compte('Instructeur'), 'instructeur')} actifs${inactifs ? `, ${pluriel(inactifs, 'personne inactive', 'personnes inactives')}` : ''}. Cette liste remplit le menu du formulaire ; une personne inactive n'y apparaît plus.`;

    const lignes = coordinateurs.filter((c) => etat.role === 'tous' || c.role === etat.role).map((c) => {
      const affilie = c.programme_affilie ? programme(c.programme_affilie) : null;
      const assigne = programme(c.programme);
      const envoi = dernierEnvoi.get(c.id);
      return `
        <tr class="${c.actif ? '' : 'is-attente'}">
          <td class="fige"><strong>${esc(c.nom)}</strong></td>
          <td><span class="role">${esc(c.role)}</span></td>
          <td class="num">${esc(c.employee_id || '–')}</td>
          <td><div class="cellule-prog"><strong>${esc(assigne.libelle)}</strong>${assigne.code ? `<span>${esc(assigne.code)}</span>` : ''}</div></td>
          <td>${affilie ? `<div class="cellule-prog"><strong>${esc(affilie.libelle)}</strong>${affilie.code ? `<span>${esc(affilie.code)}</span>` : ''}</div>` : '<span class="sous-valeur">Aucun</span>'}</td>
          <td title="${envoi ? esc(date(envoi)) : ''}">${envoi ? esc(ilYa(envoi)) : '<span class="sous-valeur">Jamais</span>'}</td>
          <td>${c.actif ? `<span class="pill pill--good">${icone('coche')}Actif</span>` : `<span class="pill pill--neutre">${icone('moins')}Inactif</span>`}</td>
          <td><div class="actions-ligne">
            <button type="button" class="btn btn--table" data-modifier="${c.id}" aria-label="Modifier ${esc(c.nom)}" title="Modifier">${icone('crayon')}</button>
          </div></td>
        </tr>`;
    });

    el.tableCoordinateurs.innerHTML = `
      <thead><tr>
        <th class="fige" scope="col">Nom et prénom</th>
        <th scope="col">Rôle</th>
        <th class="num" scope="col">ID employé</th>
        <th scope="col">Programme assigné</th>
        <th scope="col">Programme affilié</th>
        <th scope="col">Dernier envoi</th>
        <th scope="col">Statut</th>
        <th scope="col"><span class="sr-only">Actions</span></th>
      </tr></thead>
      <tbody>${lignes.length ? lignes.join('') : '<tr class="table-vide"><td colspan="8">Personne avec ce rôle pour l’instant.</td></tr>'}</tbody>`;
  }

  $('segment-role').addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-role]');
    if (!bouton) return;
    etat.role = bouton.dataset.role;
    for (const b of $('segment-role').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === bouton));
    rendreCoordinateurs();
  });

  // Le rôle suit le programme saisi tant que l'administrateur ne l'a pas choisi lui-même.
  let roleChoisiAMain = false;
  const aideRole = $('aide-role');

  function proposerRole() {
    const f = el.formCoordinateur;
    if (roleChoisiAMain || f.elements.role.value === 'Directeur de région') return;
    const programmeSaisi = f.elements.programme.value.trim();
    if (!programmeSaisi) return;
    const propose = roleSelonProgramme(programmeSaisi);
    f.elements.role.value = propose;
    aideRole.hidden = false;
    aideRole.textContent = /\bIN\b/.test(programmeSaisi) ? 'Proposé : le programme se termine par IN.' : 'Proposé : programme CR ou sans mention.';
  }

  function ouvrirDialogueCoordinateur(coordinateur) {
    etat.coordinateurEdite = coordinateur;
    roleChoisiAMain = Boolean(coordinateur);
    aideRole.hidden = true;
    const f = el.formCoordinateur;
    f.reset();
    for (const champ of f.querySelectorAll('[data-champ]')) {
      champ.classList.remove('is-invalid');
      champ.querySelector('.field__erreur').textContent = '';
    }
    el.titreDialogueCoordinateur.textContent = coordinateur ? `Modifier : ${coordinateur.nom}` : 'Ajouter une personne';
    f.elements.nom.value = coordinateur?.nom || '';
    f.elements.employee_id.value = coordinateur?.employee_id || '';
    f.elements.role.value = coordinateur?.role || 'Coordonnateur';
    f.elements.programme.value = coordinateur?.programme || '';
    f.elements.programme_affilie.value = coordinateur?.programme_affilie || '';
    f.elements.actif.checked = coordinateur ? coordinateur.actif : true;
    el.dialogueCoordinateur.showModal();
    f.elements.nom.focus();
  }

  function signalerChamp(nom, message) {
    const champ = el.formCoordinateur.querySelector(`[data-champ="${nom}"]`);
    if (!champ) return;
    champ.classList.add('is-invalid');
    champ.querySelector('.field__erreur').textContent = message;
  }

  el.tableCoordinateurs.addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-modifier]');
    if (!bouton) return;
    ouvrirDialogueCoordinateur(etat.donnees.coordinateurs.find((c) => c.id === Number(bouton.dataset.modifier)));
  });

  $('ajouter-coordinateur').addEventListener('click', () => ouvrirDialogueCoordinateur(null));

  el.formCoordinateur.addEventListener('input', (e) => {
    const champ = e.target.closest('[data-champ]');
    if (!champ) return;
    champ.classList.remove('is-invalid');
    champ.querySelector('.field__erreur').textContent = '';
    if (e.target.name === 'programme') proposerRole();
  });

  el.formCoordinateur.elements.role.addEventListener('change', () => {
    roleChoisiAMain = true;
    aideRole.hidden = true;
  });

  el.formCoordinateur.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = el.formCoordinateur;
    const corps = {
      nom: f.elements.nom.value.trim(),
      employee_id: f.elements.employee_id.value.trim(),
      role: f.elements.role.value.trim(),
      programme: f.elements.programme.value.trim(),
      programme_affilie: f.elements.programme_affilie.value.trim(),
      actif: f.elements.actif.checked,
    };
    let invalide = false;
    if (!corps.nom) { signalerChamp('nom', 'Indiquez le nom et le prénom.'); invalide = true; }
    if (!corps.programme) { signalerChamp('programme', 'Indiquez le programme assigné.'); invalide = true; }
    if (invalide) return;

    const edite = etat.coordinateurEdite;
    el.boutonEnregistrer.disabled = true;
    el.boutonEnregistrer.classList.add('is-loading');
    try {
      await api(edite ? `/api/admin/coordinateurs/${edite.id}` : '/api/admin/coordinateurs', { method: edite ? 'PUT' : 'POST', body: corps });
      el.dialogueCoordinateur.close();
      toast(edite ? `${corps.nom} : modifications enregistrées.` : `Ajout enregistré : ${corps.nom} apparaît déjà dans le formulaire.`, 'succes');
      planifierRafraichissement();
    } catch (err) {
      for (const [nom, message] of Object.entries(err.details?.champs || {})) signalerChamp(nom, message);
      toast(err.message, 'erreur');
    } finally {
      el.boutonEnregistrer.disabled = false;
      el.boutonEnregistrer.classList.remove('is-loading');
    }
  });

  // Fermeture des dialogues : boutons « Annuler », croix, clic sur le fond.
  for (const dialogue of [el.dialogueCoordinateur, el.dialogueConfirmation]) {
    dialogue.addEventListener('click', (e) => {
      if (e.target === dialogue || e.target.closest('[data-fermer]')) dialogue.close();
    });
  }

  /* ================================================================ Onglets */

  function choisirOnglet(nom, { focus = false } = {}) {
    for (const onglet of onglets) {
      const actif = onglet.dataset.onglet === nom;
      onglet.setAttribute('aria-selected', String(actif));
      onglet.tabIndex = actif ? 0 : -1;
      $(onglet.getAttribute('aria-controls')).hidden = !actif;
      if (actif && focus) onglet.focus();
    }
    cacherInfobulle();
    try {
      window.history.replaceState(null, '', `#${nom}`);
    } catch {
      // sans incidence
    }
  }

  for (const onglet of onglets) onglet.addEventListener('click', () => choisirOnglet(onglet.dataset.onglet));

  document.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = onglets.findIndex((o) => o.getAttribute('aria-selected') === 'true');
    const suivant = onglets[(i + (e.key === 'ArrowRight' ? 1 : -1) + onglets.length) % onglets.length];
    choisirOnglet(suivant.dataset.onglet, { focus: true });
  });

  /* ================================================================ Actions de l'en-tête */

  async function copierLien() {
    const lien = new URL('./', window.location.href).href;
    try {
      await navigator.clipboard.writeText(lien);
      toast(`Lien du formulaire copié : ${lien}`, 'succes');
    } catch {
      window.prompt('Copiez le lien du formulaire :', lien);
    }
  }

  $('copier-lien').addEventListener('click', copierLien);
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-copier-lien]')) copierLien();
  });

  // Le classeur est construit dans le navigateur (js/export.js) avec ExcelJS, chargé au premier export.
  const EXCELJS = {
    src: 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
    integrity: 'sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz',
  };
  let chargementExcel = null;

  function chargerExcelJS() {
    chargementExcel ??= new Promise((resolve, reject) => {
      const script = Object.assign(document.createElement('script'), { src: EXCELJS.src, integrity: EXCELJS.integrity, crossOrigin: 'anonymous' });
      script.onload = () => resolve(window.ExcelJS);
      script.onerror = () => {
        chargementExcel = null;
        script.remove();
        reject(new Error("Impossible de charger l'outil Excel. Vérifiez votre réseau puis réessayez."));
      };
      document.head.append(script);
    });
    return chargementExcel;
  }

  $('exporter').addEventListener('click', async (e) => {
    e.preventDefault();
    const lien = e.currentTarget;
    if (lien.getAttribute('aria-busy') === 'true') return;
    lien.setAttribute('aria-busy', 'true');
    toast('Préparation du fichier Excel.', 'info', 2500);
    try {
      // Données relues au moment du clic : le fichier reflète la base à cet instant.
      const [ExcelJS, donnees] = await Promise.all([chargerExcelJS(), api('/api/admin/donnees')]);
      const tampon = await window.SAI_EXCEL.construireClasseur(ExcelJS, donnees);
      const nom = `statistiques-si-aof-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(new Blob([tampon], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: nom });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast(`Fichier téléchargé : ${nom}`, 'succes');
    } catch (err) {
      if (err.statut === 401) {
        retourConnexion();
        return;
      }
      toast(err.message, 'erreur');
    } finally {
      lien.removeAttribute('aria-busy');
    }
  });

  $('deconnexion').addEventListener('click', async () => {
    try {
      await api('/api/admin/deconnexion', { method: 'POST' });
    } catch {
      // sans réseau, la session se ferme quand même sur cet appareil et expire d'elle-même
    }
    retourConnexion();
  });

  /* ================================================================ Temps réel */

  // Page visible : toutes les 10 secondes, le numéro de révision de la base dit s'il y a du nouveau.
  const INTERVALLE_SONDAGE_MS = 10000;
  let revision = null;
  let minuterieSondage;
  let sondageEnCours = false;

  async function sonder() {
    clearTimeout(minuterieSondage);
    if (document.hidden || sondageEnCours) return;
    sondageEnCours = true;
    try {
      const { revision: actuelle } = await api('/api/admin/revision');
      majDirect('ok');
      if (revision !== null && actuelle !== revision) planifierRafraichissement();
      revision = actuelle;
    } catch (err) {
      if (err.statut === 401) {
        retourConnexion();
        return;
      }
      majDirect('reconnexion');
    } finally {
      sondageEnCours = false;
    }
    minuterieSondage = setTimeout(sonder, INTERVALLE_SONDAGE_MS);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sonder();
  });

  /* ================================================================ Démarrage */

  const ongletInitial = window.location.hash.slice(1);
  choisirOnglet(onglets.some((o) => o.dataset.onglet === ongletInitial) ? ongletInitial : 'apercu');
  // Révision lue avant les données : un envoi arrivé entre les deux sera vu au sondage suivant.
  sonder().finally(rafraichir);
  // Les durées relatives (« il y a 5 minutes ») restent justes sans recharger.
  setInterval(() => {
    if (!etat.donnees) return;
    rendreAppel();
    rendreTuiles();
    rendreTableVue();
  }, 60000);
})();
