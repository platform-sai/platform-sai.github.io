'use strict';

// Export Excel du tableau de bord, construit dans le navigateur à partir de /api/admin/donnees.
// ExcelJS est chargé à la demande par chargerExcelJS() dans admin.js.
window.SAI_EXCEL = (() => {
  const COULEURS = {
    bordeaux: 'FFA01637',
    bordeauxFonce: 'FF5E0E24',
    bordeauxClair: 'FFF9E6EB',
    rosePale: 'FFFDF4F6',
    blanc: 'FFFFFFFF',
    encre: 'FF1F1417',
    gris: 'FF8A787D',
    ligne: 'FFE3D4D8',
    attente: 'FFFFF5DC',
  };

  const SEM = 'Séminaire';
  const INST = 'Institut';
  const RAE = "Réussir à l'école";
  const MIS = 'Préparation missionnaire';

  // Même teinte par programme que sur la plateforme : bordeaux, indigo, souci.
  const TEINTES_GROUPES = {
    [SEM]: { fond: 'FFA01637', texte: COULEURS.blanc },
    [INST]: { fond: 'FF2F4DB5', texte: COULEURS.blanc },
    [RAE]: { fond: 'FFE9A100', texte: 'FF1C1013' },
    [MIS]: { fond: 'FF2A1A1F', texte: COULEURS.blanc }, // encre : indicateurs transversaux, pas un programme
  };

  // Colonnes chiffrées de la synthèse ; « taux » = numérateur / dénominateur.
  const COLONNES_STATS = [
    { groupe: SEM, titre: 'Instructeurs', cle: 'sem_instructeurs' },
    { groupe: SEM, titre: 'Inscrits', cle: 'sem_inscrits' },
    { groupe: SEM, titre: 'Qui assistent', cle: 'sem_presents' },
    { groupe: SEM, titre: "Taux d'assistance", taux: ['sem_presents', 'sem_inscrits'] },
    { groupe: SEM, titre: 'Nouveaux convertis', cle: 'sem_convertis_inscrits' },
    { groupe: SEM, titre: 'Inactifs remotivés (semaine)', cle: 'sem_remotives' },
    { groupe: SEM, titre: 'Classes à ouvrir', cle: 'sem_classes_a_ouvrir' },
    { groupe: SEM, titre: 'Classes ouvertes', cle: 'sem_classes_ouvertes' },
    { groupe: INST, titre: 'Instructeurs', cle: 'inst_instructeurs' },
    { groupe: INST, titre: 'Inscrits', cle: 'inst_inscrits' },
    { groupe: INST, titre: 'Qui assistent', cle: 'inst_presents' },
    { groupe: INST, titre: "Taux d'assistance", taux: ['inst_presents', 'inst_inscrits'] },
    { groupe: INST, titre: 'Nouveaux convertis', cle: 'inst_convertis_inscrits' },
    { groupe: INST, titre: 'Inactifs remotivés (semaine)', cle: 'inst_remotives' },
    { groupe: INST, titre: 'Classes à ouvrir', cle: 'inst_classes_a_ouvrir' },
    { groupe: INST, titre: 'Classes ouvertes', cle: 'inst_classes_ouvertes' },
    { groupe: RAE, titre: 'Classes à ouvrir', cle: 'rae_classes_a_ouvrir' },
    { groupe: RAE, titre: 'Classes ouvertes', cle: 'rae_classes_ouvertes' },
    { groupe: MIS, titre: 'Inscrits', cle: 'mis_prep_inscrits' },
  ];

  const TITRES_CHAMPS = {
    sem_instructeurs: 'Sém. instructeurs', sem_inscrits: 'Sém. inscrits', sem_presents: 'Sém. qui assistent',
    sem_convertis_inscrits: 'Sém. nouveaux convertis', sem_remotives: 'Sém. inactifs remotivés (semaine)',
    sem_classes_a_ouvrir: 'Sém. classes à ouvrir', sem_classes_ouvertes: 'Sém. classes ouvertes',
    inst_instructeurs: 'Inst. instructeurs', inst_inscrits: 'Inst. inscrits', inst_presents: 'Inst. qui assistent',
    inst_convertis_inscrits: 'Inst. nouveaux convertis', inst_remotives: 'Inst. inactifs remotivés (semaine)',
    inst_classes_a_ouvrir: 'Inst. classes à ouvrir', inst_classes_ouvertes: 'Inst. classes ouvertes',
    rae_classes_a_ouvrir: 'RAE classes à ouvrir', rae_classes_ouvertes: 'RAE classes ouvertes',
    mis_prep_inscrits: 'Préparation missionnaire',
  };

  const TYPE_PROGRAMME = { principal: 'Assigné', affilie: 'Affilié' };
  const FORMAT_DATE = 'dd/mm/yyyy hh:mm';
  const bordure = { style: 'thin', color: { argb: COULEURS.ligne } };
  const BORDURES = { top: bordure, left: bordure, bottom: bordure, right: bordure };

  // Les heures sont enregistrées en UTC = heure GMT d'Abidjan et de Lomé.
  const versDate = (iso) => (iso ? new Date(iso) : null);

  function styleEntete(cellule, fond = COULEURS.bordeaux) {
    cellule.font = { bold: true, color: { argb: COULEURS.blanc }, name: 'Calibri', size: 11 };
    cellule.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fond } };
    cellule.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cellule.border = BORDURES;
  }

  function bandeauTitre(ws, nbColonnes, titre, sousTitre) {
    ws.mergeCells(1, 1, 1, nbColonnes);
    const t = ws.getCell(1, 1);
    t.value = titre;
    t.font = { bold: true, size: 16, color: { argb: COULEURS.blanc }, name: 'Calibri' };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEURS.bordeauxFonce } };
    t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(1).height = 30;

    ws.mergeCells(2, 1, 2, nbColonnes);
    const s = ws.getCell(2, 1);
    s.value = sousTitre;
    s.font = { italic: true, size: 10, color: { argb: COULEURS.gris } };
    s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(2).height = 18;
  }

  function feuilleSynthese(wb, vue, totaux, genereLe) {
    const ws = wb.addWorksheet('Synthèse', { properties: { tabColor: { argb: COULEURS.bordeaux } } });
    // Colonnes descriptives : chacune sait lire sa valeur, sa largeur et sa mise en forme.
    const infos = [
      { titre: 'Responsable', largeur: 30, valeur: (l) => l.coordinateur_nom },
      { titre: 'Rôle', largeur: 15, valeur: (l) => l.role },
      { titre: 'ID employé', largeur: 12, valeur: (l) => l.employee_id || '' },
      { titre: 'Programme', largeur: 40, valeur: (l) => l.programme, renvoi: true },
      { titre: 'Type', largeur: 10, valeur: (l) => TYPE_PROGRAMME[l.programme_type] },
      { titre: 'Statut', largeur: 12, valeur: (l) => (l.rapport ? 'Reçu' : 'En attente'), statut: true },
      { titre: 'Mis à jour (GMT)', largeur: 17, valeur: (l) => (l.rapport ? versDate(l.rapport.soumis_le) : null), format: FORMAT_DATE },
    ];
    const colStatut = infos.findIndex((i) => i.statut) + 1;
    const nbColonnes = infos.length + COLONNES_STATS.length + 1;
    const LIGNE_GROUPES = 4;
    const LIGNE_ENTETES = 5;
    const PREMIERE_LIGNE = 6;

    bandeauTitre(ws, nbColonnes, "Rapport statistique S&I — Afrique de l'Ouest Francophone",
      `Dernier rapport de chaque programme · ${totaux.recus} programme(s) sur ${totaux.attendus} ont répondu · Généré le ${genereLe}`);

    infos.forEach((info, i) => {
      ws.mergeCells(LIGNE_GROUPES, i + 1, LIGNE_ENTETES, i + 1);
      const c = ws.getCell(LIGNE_GROUPES, i + 1);
      c.value = info.titre;
      styleEntete(c, COULEURS.bordeauxFonce);
      ws.getColumn(i + 1).width = info.largeur;
    });

    let col = infos.length + 1;
    for (const groupe of [SEM, INST, RAE, MIS]) {
      const colonnes = COLONNES_STATS.filter((s) => s.groupe === groupe);
      ws.mergeCells(LIGNE_GROUPES, col, LIGNE_GROUPES, col + colonnes.length - 1);
      const g = ws.getCell(LIGNE_GROUPES, col);
      g.value = groupe;
      styleEntete(g, TEINTES_GROUPES[groupe].fond);
      g.font = { ...g.font, color: { argb: TEINTES_GROUPES[groupe].texte } };
      colonnes.forEach((s, i) => {
        const c = ws.getCell(LIGNE_ENTETES, col + i);
        c.value = s.titre;
        styleEntete(c);
        ws.getColumn(col + i).width = s.taux ? 12 : 11;
      });
      col += colonnes.length;
    }
    const colCommentaire = col;
    ws.mergeCells(LIGNE_GROUPES, colCommentaire, LIGNE_ENTETES, colCommentaire);
    const cc = ws.getCell(LIGNE_GROUPES, colCommentaire);
    cc.value = 'Commentaire';
    styleEntete(cc, COULEURS.bordeauxFonce);
    ws.getColumn(colCommentaire).width = 40;
    ws.getRow(LIGNE_GROUPES).height = 20;
    ws.getRow(LIGNE_ENTETES).height = 32;

    const colonneDe = (cle) => infos.length + 1 + COLONNES_STATS.findIndex((s) => s.cle === cle);

    vue.forEach((ligne, i) => {
      const r = ligne.rapport;
      const row = ws.getRow(PREMIERE_LIGNE + i);
      row.values = [
        ...infos.map((info) => info.valeur(ligne)),
        ...COLONNES_STATS.map((s) => {
          if (!r) return null;
          if (!s.taux) return r[s.cle];
          const [num, den] = s.taux;
          return r[den] > 0 ? r[num] / r[den] : null;
        }),
        r?.commentaire || '',
      ];
      row.eachCell({ includeEmpty: true }, (c, n) => {
        c.border = BORDURES;
        c.alignment = { vertical: 'middle', wrapText: n === colCommentaire || Boolean(infos[n - 1]?.renvoi) };
        if (infos[n - 1]?.format) c.numFmt = infos[n - 1].format;
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEURS.rosePale } };
      });
      const statut = row.getCell(colStatut);
      statut.font = { bold: true, color: { argb: r ? 'FF0B6B1F' : 'FF8A5300' } };
      if (!r) statut.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEURS.attente } };
      COLONNES_STATS.forEach((s, j) => {
        const c = row.getCell(infos.length + 1 + j);
        c.alignment = { vertical: 'middle', horizontal: 'center' };
        if (s.taux) c.numFmt = '0%';
      });
    });

    // Ligne de totaux en formules : elle reste juste si l'utilisateur modifie le fichier.
    const derniere = PREMIERE_LIGNE + vue.length - 1;
    const ligneTotal = ws.getRow(derniere + 2);
    ligneTotal.getCell(1).value = `TOTAL — ${totaux.recus} / ${totaux.attendus} programmes`;
    ws.mergeCells(derniere + 2, 1, derniere + 2, infos.length);
    COLONNES_STATS.forEach((s, j) => {
      const c = ligneTotal.getCell(infos.length + 1 + j);
      const lettre = ws.getColumn(infos.length + 1 + j).letter;
      if (s.taux) {
        const [num, den] = s.taux;
        const lNum = ws.getColumn(colonneDe(num)).letter;
        const lDen = ws.getColumn(colonneDe(den)).letter;
        c.value = {
          formula: `IF(${lDen}${derniere + 2}=0,"",${lNum}${derniere + 2}/${lDen}${derniere + 2})`,
          result: totaux[den] > 0 ? totaux[num] / totaux[den] : '',
        };
        c.numFmt = '0%';
      } else {
        c.value = vue.length ? { formula: `SUM(${lettre}${PREMIERE_LIGNE}:${lettre}${derniere})`, result: totaux[s.cle] } : 0;
      }
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    ligneTotal.height = 24;
    for (let n = 1; n <= nbColonnes; n += 1) {
      const c = ligneTotal.getCell(n);
      c.font = { bold: true, color: { argb: COULEURS.blanc } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEURS.bordeaux } };
      c.border = BORDURES;
    }

    ws.autoFilter = { from: { row: LIGNE_ENTETES, column: 1 }, to: { row: LIGNE_ENTETES, column: nbColonnes } };
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: LIGNE_ENTETES, activeCell: 'B6' }];
  }

  function feuilleHistorique(wb, rapports, champs, genereLe) {
    const ws = wb.addWorksheet('Historique', { properties: { tabColor: { argb: COULEURS.bordeauxFonce } } });
    const colonnes = [
      { titre: 'N°', largeur: 7, valeur: (r) => r.id },
      { titre: 'Soumis le (GMT)', largeur: 17, valeur: (r) => versDate(r.soumis_le), format: FORMAT_DATE },
      { titre: 'Responsable', largeur: 30, valeur: (r) => r.coordinateur_nom },
      { titre: 'Programme', largeur: 40, valeur: (r) => r.programme },
      { titre: 'Type', largeur: 10, valeur: (r) => TYPE_PROGRAMME[r.programme_type] },
      ...champs.map((cle) => ({ titre: TITRES_CHAMPS[cle], largeur: 12, valeur: (r) => r[cle], centre: true })),
      { titre: 'Commentaire', largeur: 40, valeur: (r) => r.commentaire || '' },
    ];
    bandeauTitre(ws, colonnes.length, 'Historique complet des rapports',
      `${rapports.length} envoi(s), du plus récent au plus ancien · Généré le ${genereLe}`);

    const LIGNE_ENTETES = 4;
    colonnes.forEach((col, i) => {
      const c = ws.getCell(LIGNE_ENTETES, i + 1);
      c.value = col.titre;
      styleEntete(c);
      ws.getColumn(i + 1).width = col.largeur;
    });
    ws.getRow(LIGNE_ENTETES).height = 32;

    rapports.forEach((r, i) => {
      const row = ws.getRow(LIGNE_ENTETES + 1 + i);
      row.values = colonnes.map((col) => col.valeur(r));
      colonnes.forEach((col, j) => {
        const c = row.getCell(j + 1);
        c.border = BORDURES;
        c.alignment = { vertical: 'middle', horizontal: col.centre ? 'center' : undefined, wrapText: col.titre === 'Commentaire' };
        if (col.format) c.numFmt = col.format;
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEURS.rosePale } };
      });
    });

    ws.autoFilter = { from: { row: LIGNE_ENTETES, column: 1 }, to: { row: LIGNE_ENTETES, column: colonnes.length } };
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: LIGNE_ENTETES }];
  }

  function feuilleCoordinateurs(wb, coordinateurs, genereLe) {
    const ws = wb.addWorksheet('Coordonnateurs et instructeurs');
    const colonnes = [
      { titre: 'Nom et prénom', largeur: 32, valeur: (c) => c.nom },
      { titre: 'ID employé', largeur: 13, valeur: (c) => c.employee_id || '' },
      { titre: 'Rôle', largeur: 20, valeur: (c) => c.role },
      { titre: 'Programme assigné', largeur: 42, valeur: (c) => c.programme },
      { titre: 'Programme affilié', largeur: 42, valeur: (c) => c.programme_affilie || '' },
      { titre: 'Actif', largeur: 8, valeur: (c) => (c.actif ? 'Oui' : 'Non') },
    ];
    bandeauTitre(ws, colonnes.length, 'Coordonnateurs, instructeurs et programmes', `Généré le ${genereLe}`);
    colonnes.forEach((col, i) => {
      const c = ws.getCell(4, i + 1);
      c.value = col.titre;
      styleEntete(c);
      ws.getColumn(i + 1).width = col.largeur;
    });
    coordinateurs.forEach((coord, i) => {
      const row = ws.getRow(5 + i);
      row.values = colonnes.map((col) => col.valeur(coord));
      row.eachCell({ includeEmpty: true }, (c) => { c.border = BORDURES; });
    });
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: colonnes.length } };
    ws.views = [{ state: 'frozen', ySplit: 4 }];
  }

  async function construireClasseur(ExcelJS, { champs, vue, totaux, rapports, coordinateurs }) {
    const genereLe = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Abidjan' })
      .format(new Date()) + ' (GMT)';

    const wb = new ExcelJS.Workbook();
    wb.creator = "Séminaire et Institut — Afrique de l'Ouest Francophone";
    wb.created = new Date();
    feuilleSynthese(wb, vue, totaux, genereLe);
    feuilleHistorique(wb, rapports, champs, genereLe);
    feuilleCoordinateurs(wb, coordinateurs, genereLe);
    return wb.xlsx.writeBuffer();
  }

  return { construireClasseur };
})();
