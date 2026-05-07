/* =====================================================================
     DONNÉES : récupération des JSON embarqués
  ===================================================================== */
const META = JSON.parse(document.getElementById("jsMeta").textContent);
const ORDER = JSON.parse(document.getElementById("jsOrder").textContent);

/* CAL est initialisé après le fetch() dans init() */
let CAL = {};
/* CAL_BASE : copie de la source JSON, pour calculer les deltas */
let CAL_BASE = {};
/* Delta : { "Mois": { "jour": { "groupe": valeur | null (=suppression) } } } */
let CAL_DELTA = {};

/** Charge le delta depuis localStorage */
function loadDelta() {
  try { return JSON.parse(localStorage.getItem("cal_delta")) || {}; } catch { return {}; }
}

/** Applique le delta sur CAL (par-dessus CAL_BASE) */
function applyDelta() {
  Object.entries(CAL_DELTA).forEach(([month, days]) => {
    if (!CAL[month]) CAL[month] = [];
    Object.entries(days).forEach(([dayStr, changes]) => {
      const d = Number(dayStr);
      let entry = CAL[month].find((e) => e.day === d);
      if (!entry) {
        entry = { day: d, events: {} };
        CAL[month].push(entry);
        CAL[month].sort((a, b) => a.day - b.day);
      }
      if (!entry.events) entry.events = {};
      Object.entries(changes).forEach(([group, val]) => {
        if (val === null) delete entry.events[group];
        else entry.events[group] = val;
      });
    });
  });
}

/** Enregistre une modification dans le delta et sauvegarde */
function recordDelta(monthName, day, group, val) {
  if (!CAL_DELTA[monthName]) CAL_DELTA[monthName] = {};
  if (!CAL_DELTA[monthName][day]) CAL_DELTA[monthName][day] = {};
  CAL_DELTA[monthName][day][group] = val; /* null = suppression */
  try { localStorage.setItem("cal_delta", JSON.stringify(CAL_DELTA)); } catch {}
}

/** Sauvegarde (appelée après chaque modification de CAL) — enregistre le delta */
function persistCAL() {
  /* Recalculer le delta complet par rapport à CAL_BASE */
  CAL_DELTA = {};
  ORDER.forEach((month) => {
    const baseEntries = CAL_BASE[month] || [];
    const curEntries  = CAL[month]  || [];
    /* Événements ajoutés ou modifiés */
    curEntries.forEach((entry) => {
      const baseEntry = baseEntries.find((e) => e.day === entry.day);
      const baseEvts  = (baseEntry && baseEntry.events) ? baseEntry.events : {};
      Object.entries(entry.events || {}).forEach(([g, v]) => {
        if (baseEvts[g] !== v) recordDelta(month, entry.day, g, v);
      });
      /* Événements supprimés */
      Object.keys(baseEvts).forEach((g) => {
        if (!(entry.events || {})[g]) recordDelta(month, entry.day, g, null);
      });
    });
    /* Jours entièrement disparus */
    baseEntries.forEach((baseEntry) => {
      if (!curEntries.find((e) => e.day === baseEntry.day)) {
        Object.keys(baseEntry.events || {}).forEach((g) => {
          recordDelta(month, baseEntry.day, g, null);
        });
      }
    });
  });
}

/* Groupes MMI disponibles */
const GROUPS = [
  "MMI1",
  "MMI2-crea",
  "MMI2-Dev",
  "MMI2-App",
  "MMI3-crea",
  "MMI3-Dev",
  "MMI3-App",
  "Salons",
  "JPO",
  "Autre",
  "Réunion",
  "Férié",
];

/* Libellés courts et longs des jours ouvrés uniquement (Lu–Ve) */
const WD_S = ["Lu", "Ma", "Me", "Je", "Ve"];
const WD_L = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
/* Tableau complet (0=Lu…6=Di) pour les calculs d'index */
const WD_L_FULL = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

/* État de l'application */
let activeGroups = new Set(GROUPS); /* Groupes actuellement affichés */
let currentView = "month";
let currentMonth = ORDER[0];

/* =====================================================================
     UTILITAIRES
  ===================================================================== */

/**
 * Catégorise un texte d'événement pour choisir sa couleur d'affichage.
 * @param {string} t - Texte de l'événement
 * @returns {string} Clé de catégorie CSS (sae, entreprise, vacances, stage, examen, ferie, autre)
 */
function getCategory(t) {
  if (!t) return "autre";
  const s = t.toLowerCase();
  if (s.includes("vacances")) return "vacances";
  if (s.includes("entreprise") || s.includes("alternance")) return "entreprise";
  if (s.includes("sae") || s.includes("saé")) return "sae";
  if (s.includes("stage")) return "stage";
  if (
    s.includes("examen") ||
    s.includes("soutean") ||
    s.includes("soutenance") ||
    s.includes("grand jury") ||
    s.includes("jury") ||
    s.includes("rattrapages") ||
    s.includes("portfolio")
  )
    return "examen";
  if (
    s.includes("noel") ||
    s.includes("noël") ||
    s.includes("jour de l'an") ||
    s.includes("toussaint") ||
    s.includes("tousaint") ||
    s.includes("armistice") ||
    s.includes("pâques") ||
    s.includes("paques") ||
    s.includes("pentecôte") ||
    s.includes("pentecote") ||
    s.includes("victoire") ||
    s.includes("ascension") ||
    s.includes("fête du travail") ||
    s.includes("fete du travail")
  )
    return "ferie";
  return "autre";
}

/**
 * Convertit l'index JS du jour (0=Dimanche) vers index semaine Lu=0…Di=6
 */
function weekdayIdx(jsDay) {
  return jsDay === 0 ? 6 : jsDay - 1;
}

/** Premier jour de la semaine (0=Lu) du 1er du mois */
function firstWd(y, m) {
  return weekdayIdx(new Date(y, m - 1, 1).getDay());
}

/** Nombre de jours dans un mois */
function daysIn(y, m) {
  return new Date(y, m, 0).getDate();
}

/** Récupère les données d'un jour précis dans un mois */
function getDayData(month, day) {
  return (CAL[month] || []).find((d) => d.day === day) || null;
}

/* Date du jour pour mettre en évidence "aujourd'hui" */
const TODAY = new Date();
function isToday(y, m, d) {
  return (
    TODAY.getFullYear() === y &&
    TODAY.getMonth() + 1 === m &&
    TODAY.getDate() === d
  );
}

/* =====================================================================
     FILTRES PAR GROUPE
  ===================================================================== */

/** Construit les checkboxes de filtre dans la barre d'outils */
function buildFilters() {
  const wrap = document.getElementById("filterGroups");
  GROUPS.forEach((g) => {
    const id = "fcb-" + g.replace(/[^a-z0-9]/gi, "-");

    /* Checkbox native (cachée visuellement, accessible au clavier) */
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.className = "fcb";
    cb.checked = true;
    cb.setAttribute("aria-label", "Afficher le groupe " + g);

    /* Mise à jour du filtre lors du changement */
    cb.addEventListener("change", () => {
      cb.checked ? activeGroups.add(g) : activeGroups.delete(g);
      /* Masquer/afficher toutes les pills correspondantes */
      document.querySelectorAll(".pill[data-g]").forEach((p) => {
        p.classList.toggle("hidden", !activeGroups.has(p.dataset.g));
      });
    });

    /* Label stylisé associé à la checkbox */
    const lbl = document.createElement("label");
    lbl.htmlFor = id;
    lbl.className = "flbl";
    lbl.dataset.g = g;
    lbl.textContent = g;

    wrap.append(cb, lbl);
  });

  /* Bouton Tout décocher / Tout cocher */
  const btn = document.getElementById("btnToggleAll");
  btn.addEventListener("click", () => {
    const allChecked = GROUPS.every((g) => activeGroups.has(g));
    const checkboxes = document.querySelectorAll(".fcb");
    if (allChecked) {
      /* Tout décocher */
      activeGroups.clear();
      checkboxes.forEach((cb) => { cb.checked = false; });
      btn.textContent = "Tout cocher";
    } else {
      /* Tout cocher */
      GROUPS.forEach((g) => activeGroups.add(g));
      checkboxes.forEach((cb) => { cb.checked = true; });
      btn.textContent = "Tout décocher";
    }
    document.querySelectorAll(".pill[data-g]").forEach((p) => {
      p.classList.toggle("hidden", !activeGroups.has(p.dataset.g));
    });
  });
}

/* =====================================================================
     NAVIGATION MENSUELLE
  ===================================================================== */

/** Construit les boutons de navigation rapide */
function buildNav() {
  const nav = document.getElementById("monthNav");
  ORDER.forEach((m) => {
    const btn = document.createElement("button");
    btn.className = "month-btn";
    /* Libellé court : "Sept '25" */
    btn.textContent = m.replace(" 2025", " '25").replace(" 2026", " '26");
    btn.dataset.m = m;
    btn.setAttribute("aria-label", "Aller à " + m);
    btn.addEventListener("click", () => goToMonth(m));
    nav.appendChild(btn);
  });
  updateNav();
}

/** Met à jour l'état actif (aria-current) des boutons de navigation */
function updateNav() {
  document.querySelectorAll(".month-btn").forEach((b) => {
    b.setAttribute("aria-current", String(b.dataset.m === currentMonth));
  });
}

/* =====================================================================
     CONSTRUCTION DU CALENDRIER MENSUEL
  ===================================================================== */

/**
 * Crée une pastille (pill) pour un événement d'un groupe.
 * @param {string} group - Identifiant du groupe MMI
 * @param {string} text  - Texte de l'événement
 * @returns {HTMLElement}
 */
function makePill(group, text) {
  const cat = getCategory(text);
  const grpClass = "grp-" + group.replace(/[^a-z0-9]/gi, "-");
  const pill = document.createElement("div");
  pill.className = "pill cat-" + cat + " " + grpClass;
  pill.dataset.g = group; /* Pour le filtrage */
  pill.setAttribute("role", "listitem");
  pill.title = group + " : " + text; /* Tooltip natif accessible */

  /* Masquer si le groupe est filtré */
  if (!activeGroups.has(group)) pill.classList.add("hidden");

  /* Tag groupe (micro-texte en tête de pill) */
  const span = document.createElement("span");
  span.className = "pill-grp";
  span.setAttribute("aria-hidden", "true"); /* Déjà dans le title */
  span.textContent = group;

  pill.append(span, document.createTextNode(text));
  return pill;
}

/**
 * Règles de répétition hebdomadaire : groupe → [catégories] à répéter sur toute la semaine.
 * - Tous les groupes : événements "SAE"
 * - MMI2-App / MMI3-App : aussi "Entreprise"
 * - MMI2-crea / MMI2-Dev / MMI3-crea / MMI3-Dev : aussi "Stage"
 * Les vacances sont gérées via le fond grisé de la cellule (pas de pill).
 */
const WEEK_SPAN = {
  MMI1: ["sae"],
  "MMI2-crea": ["sae", "stage"],
  "MMI2-Dev": ["sae", "stage"],
  "MMI2-App": ["sae", "entreprise"],
  "MMI3-crea": ["sae", "stage"],
  "MMI3-Dev": ["sae", "stage"],
  "MMI3-App": ["sae", "entreprise"],
};

/** Indique si un événement doit être répété sur tous les jours ouvrés de la semaine. */
function isWeekSpanning(group, text) {
  return group in WEEK_SPAN && WEEK_SPAN[group].includes(getCategory(text));
}

/**
 * Crée une pill colorée avec la couleur du groupe (pour la barre hebdomadaire).
 * Les couleurs correspondent exactement aux badges du filtre.
 */
function makeGroupPill(group, text) {
  const pill = document.createElement("div");
  /* Classe grp-XXX pour la couleur groupe (ex: grp-MMI2-App) */
  pill.className = "pill grp-" + group.replace(/[^a-z0-9]/gi, "-");
  pill.dataset.g = group;
  pill.setAttribute("role", "listitem");
  pill.title = group + " : " + text;
  if (!activeGroups.has(group)) pill.classList.add("hidden");

  const span = document.createElement("span");
  span.className = "pill-grp";
  span.setAttribute("aria-hidden", "true");
  span.textContent = group;

  pill.append(span, document.createTextNode(text));
  return pill;
}

/**
 * Construit la section HTML d'un mois (grille 5×N, Lu–Ve).
 * Rendu semaine par semaine : une barre pleine largeur précède chaque semaine
 * pour afficher les événements "Entreprise" de MMI2-App et MMI3-App.
 */
function buildMonthSection(monthName) {
  const [y, m] = META[monthName];
  const fw = firstWd(y, m);
  const tot = daysIn(y, m);

  const sec = document.createElement("section");
  sec.className = "month-section";
  sec.id = "ms-" + monthName.replace(/\s+/g, "-");
  sec.setAttribute("aria-label", "Planning " + monthName);

  const hdr = document.createElement("div");
  hdr.className = "month-hdr";
  hdr.innerHTML = "<h2>" + monthName + "</h2>";

  /* En-têtes Lu–Ve — dans month-hdr (sticky) pour qu'ils restent visibles
       au scroll, et hors du cal-grid (overflow:hidden casserait le sticky) */
  const wdhRow = document.createElement("div");
  wdhRow.className = "cal-wdh-row";
  wdhRow.setAttribute("role", "row");
  WD_L.forEach((label) => {
    const th = document.createElement("div");
    th.className = "cal-wdh";
    th.setAttribute("role", "columnheader");
    th.setAttribute("aria-label", label);
    th.textContent = label;
    wdhRow.appendChild(th);
  });
  hdr.appendChild(wdhRow);
  sec.appendChild(hdr);

  const grid = document.createElement("div");
  grid.className = "cal-grid";
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", "Calendrier " + monthName);

  /* ── Construire un tableau de semaines ──────────────────────────────
       Chaque semaine = tableau de 5 slots.
       null  → cellule vide (padding début/fin)
       objet → { d, wi, dd } pour un jour ouvré
    ─────────────────────────────────────────────────────────────────── */
  const emptyStart = fw <= 4 ? fw : 0;
  const weeks = [];
  let slot = new Array(emptyStart).fill(null); /* Décalage de début */

  for (let d = 1; d <= tot; d++) {
    const wi = (fw + d - 1) % 7;
    if (wi >= 5) continue; /* Ignorer Sa et Di */
    slot.push({ d, wi, dd: getDayData(monthName, d) });
    if (slot.length === 5) {
      weeks.push(slot);
      slot = [];
    }
  }
  /* Dernière semaine incomplète */
  if (slot.length > 0) {
    while (slot.length < 5) slot.push(null);
    weeks.push(slot);
  }

  /* ── Rendu semaine par semaine ───────────────────────────────────── */
  for (const week of weeks) {
    /* Collecter les événements "Entreprise" App de la semaine
         (premier trouvé par groupe, généralement le lundi) */
    /* { groupe: { ev, sourceDay } } — sourceDay = jour où l'événement est stocké dans CAL */
    const appEvts = {};
    for (const day of week) {
      if (!day || !day.dd || !day.dd.events) continue;
      for (const g of Object.keys(WEEK_SPAN)) {
        if (
          !appEvts[g] &&
          day.dd.events[g] &&
          isWeekSpanning(g, day.dd.events[g])
        ) {
          appEvts[g] = { ev: day.dd.events[g], sourceDay: day.d };
        }
      }
    }

    /* ── Cellules des 5 jours de la semaine ── */
    for (const day of week) {
      if (!day) {
        /* Cellule vide (padding) */
        const e = document.createElement("div");
        e.className = "cal-cell empty";
        e.setAttribute("aria-hidden", "true");
        grid.appendChild(e);
        continue;
      }

      const { d, wi, dd } = day;
      /* Détecter si le jour est en vacances :
           - événement vacances dans les données, OU
           - dans les 4 jours ouvrés qui suivent un jour de vacances
           Sauf si la date est explicitement exclue (VACANCE_EXCLUSIONS). */
      const dateKey = y + "-" + m + "-" + d;
      const isVacance =
        !isToday(y, m, d) &&                          /* aujourd'hui n'est jamais grisé vacances */
        !VACANCE_EXCLUSIONS.has(dateKey) &&
        (FERIES.has(dateKey) ||
          vacanceDates.has(dateKey) ||
          (dd &&
            dd.events &&
            Object.values(dd.events).some(
              (ev) => getCategory(ev) === "vacances",
            )));
      const cell = document.createElement("div");
      cell.className =
        "cal-cell" +
        (isToday(y, m, d) ? " today" : "") +
        (isVacance ? " vacance" : "");
      cell.setAttribute("role", "gridcell");

      const dayLabel = WD_L_FULL[wi] + " " + d + " " + monthName;
      cell.setAttribute("aria-label", dayLabel);

      /* Numéro + badge semaine */
      const top = document.createElement("div");
      top.className = "day-top";
      const num = document.createElement("span");
      num.className = "day-num";
      num.setAttribute("aria-hidden", "true");
      num.textContent = d;
      top.appendChild(num);
      if (dd && dd.week) {
        const wb = document.createElement("span");
        wb.className = "wk-badge";
        wb.textContent = "S" + dd.week;
        wb.setAttribute("aria-label", "Semaine " + dd.week);
        top.appendChild(wb);
      }
      /* Label VACANCES sur les jours grisés */
      if (isVacance && !FERIES.has(dateKey)) {
        const vacLbl = document.createElement("span");
        vacLbl.className = "vacance-lbl";
        vacLbl.textContent = "VACANCES";
        top.appendChild(vacLbl);
      }

      /* Bouton + aligné à droite sur la ligne du numéro de jour */
      const addBtn = document.createElement("button");
      addBtn.className = "add-evt-btn";
      addBtn.setAttribute("aria-label", "Ajouter un événement le " + dayLabel);
      addBtn.textContent = "+";
      const dateStr =
        y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openAddEventModal(dateStr);
      });
      top.appendChild(addBtn);

      cell.appendChild(top);

      /* Événements */
      const evDiv = document.createElement("div");
      evDiv.className = "day-evts";
      evDiv.setAttribute("role", "list");
      evDiv.setAttribute("aria-label", "Événements du " + dayLabel);

      /* Ordre d'affichage des groupes dans la cellule */
      const GROUP_ORDER = [
        "Férié", "Salons", "JPO", "Autre", "Réunion",
        "MMI1", "MMI2-crea", "MMI2-Dev", "MMI2-App",
        "MMI3-crea", "MMI3-Dev", "MMI3-App",
      ];
      const groupPriority = (g) => {
        const i = GROUP_ORDER.indexOf(g);
        return i === -1 ? GROUP_ORDER.length : i;
      };

      /* Collecter tous les événements du jour (vacances exclus) */
      const allEvts = []; /* { g, ev, sourceDay } */

      /* Événements semaine-complète */
      for (const [g, { ev, sourceDay }] of Object.entries(appEvts)) {
        if (getCategory(ev) === "vacances") continue;
        allEvts.push({ g, ev, sourceDay });
      }

      /* Événements du jour */
      if (dd && dd.events) {
        Object.entries(dd.events).forEach(([g, ev]) => {
          if (isWeekSpanning(g, ev)) return;
          if (getCategory(ev) === "vacances") return;
          allEvts.push({ g, ev, sourceDay: d });
        });
      }

      /* Trier par priorité puis rendre */
      allEvts.sort((a, b) => groupPriority(a.g) - groupPriority(b.g));
      allEvts.forEach(({ g, ev, sourceDay }) => {
        const isSpanning = g in appEvts;
        const pill = isSpanning ? makeGroupPill(g, ev) : makePill(g, ev);
        pill.addEventListener("click", () =>
          openEventDetail(g, ev, monthName, sourceDay),
        );
        evDiv.appendChild(pill);
      });

      if (evDiv.hasChildNodes()) cell.appendChild(evDiv);

      grid.appendChild(cell);
    }
  }

  sec.appendChild(grid);
  return sec;
}

/* =====================================================================
     VUE ANNUELLE (mini-calendriers)
  ===================================================================== */

/** Construit la grille annuelle avec 12 mini-calendriers */
function buildYearView() {
  const ygrid = document.getElementById("yearGrid");

  ORDER.forEach((monthName) => {
    const [y, m] = META[monthName];
    const fw = firstWd(y, m);
    const tot = daysIn(y, m);

    /* Carte du mois */
    const card = document.createElement("article");
    card.className = "mini-card";
    card.setAttribute("aria-label", monthName);

    /* En-tête cliquable → bascule sur la vue mois */
    const title = document.createElement("div");
    title.className = "mini-title";
    title.textContent = monthName;
    title.setAttribute("role", "button");
    title.setAttribute("tabindex", "0");
    title.setAttribute("aria-label", "Voir " + monthName + " en détail");
    title.addEventListener("click", () => {
      setView("month");
      goToMonth(monthName);
    });
    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setView("month");
        goToMonth(monthName);
      }
    });

    /* Grille mini */
    const mg = document.createElement("div");
    mg.className = "mini-g";
    mg.setAttribute("role", "grid");
    mg.setAttribute("aria-label", monthName);

    /* En-têtes Lu–Ve */
    WD_S.forEach((s, i) => {
      const th = document.createElement("div");
      th.className = "mini-wdh";
      th.setAttribute("role", "columnheader");
      th.setAttribute("aria-label", WD_L[i]);
      th.textContent = s;
      mg.appendChild(th);
    });

    /* Cellules vides début (jours ouvrés manquants avant le 1er du mois) */
    const emptyStart = fw <= 4 ? fw : 0;
    for (let i = 0; i < emptyStart; i++) {
      const e = document.createElement("div");
      e.className = "mini-c empty";
      e.setAttribute("aria-hidden", "true");
      mg.appendChild(e);
    }

    /* Jours (samedis et dimanches ignorés) */
    let renderedCount = emptyStart;
    for (let d = 1; d <= tot; d++) {
      const wi = (fw + d - 1) % 7;
      if (wi >= 5) continue; /* Ignorer Sa et Di */

      const dd = getDayData(monthName, d);
      const evs = dd && dd.events ? Object.values(dd.events) : [];

      const c = document.createElement("div");
      c.className = "mini-c";
      c.setAttribute("role", "gridcell");
      const lblEv = evs.length > 0 ? " — " + evs.join(", ") : "";
      c.setAttribute("aria-label", WD_L_FULL[wi] + " " + d + lblEv);

      /* Numéro de jour */
      const n = document.createElement("span");
      n.className = "mini-n";
      n.setAttribute("aria-hidden", "true");
      n.textContent = d;
      c.appendChild(n);

      /* Points colorés (un par catégorie d'événement) */
      if (evs.length > 0) {
        const dots = document.createElement("div");
        dots.className = "mini-dots";
        const cats = new Set(evs.map(getCategory));
        cats.forEach((cat) => {
          const dot = document.createElement("span");
          dot.className = "mini-dot";
          dot.style.background = "var(--clr-" + cat + ")";
          dot.setAttribute("aria-hidden", "true");
          dots.appendChild(dot);
        });
        c.appendChild(dots);
      }

      mg.appendChild(c);
      renderedCount++;
    }

    /* Cellules vides de fin (compléter la dernière ligne à 5) */
    const remMini = renderedCount % 5;
    if (remMini !== 0) {
      for (let i = remMini; i < 5; i++) {
        const e = document.createElement("div");
        e.className = "mini-c empty";
        e.setAttribute("aria-hidden", "true");
        mg.appendChild(e);
      }
    }

    card.append(title, mg);
    ygrid.appendChild(card);
  });
}

/* =====================================================================
     NAVIGATION ENTRE VUES ET MOIS
  ===================================================================== */

/**
 * Affiche le mois sélectionné dans la vue mois.
 * @param {string} m - Nom du mois
 */
function goToMonth(m) {
  currentMonth = m;
  /* Masquer tous les mois sauf le sélectionné */
  document
    .querySelectorAll(".month-section")
    .forEach((s) => s.classList.remove("active"));
  const target = document.getElementById("ms-" + m.replace(/\s+/g, "-"));
  if (target) {
    target.classList.add("active");
    /* Scroll doux vers le contenu */
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  updateNav();
}

/**
 * Bascule entre la vue mois et la vue annuelle.
 * @param {string} v - 'month' ou 'year'
 */
function setView(v) {
  currentView = v;
  const mc = document.getElementById("monthsContainer");
  const yc = document.getElementById("yearContainer");
  const bm = document.getElementById("btnMonth");
  const by = document.getElementById("btnYear");

  if (v === "month") {
    mc.style.display = "";
    yc.style.display = "none";
    bm.classList.add("active");
    bm.setAttribute("aria-pressed", "true");
    by.classList.remove("active");
    by.setAttribute("aria-pressed", "false");
    goToMonth(currentMonth);
  } else {
    mc.style.display = "none";
    yc.style.display = "";
    bm.classList.remove("active");
    bm.setAttribute("aria-pressed", "false");
    by.classList.add("active");
    by.setAttribute("aria-pressed", "true");
  }
}

/* =====================================================================
     PRÉ-CALCUL DES JOURS GRISÉS VACANCES
  ===================================================================== */

/* Jours fériés à griser comme les vacances (format "YYYY-M-D") */
const FERIES = new Set([
  "2025-11-1",  /* Toussaint */
  "2025-11-11", /* Armistice */
  "2026-1-1",   /* Jour de l'an */
  "2026-4-6",   /* Lundi de Pâques */
  "2026-5-1",   /* Fête du Travail */
  "2026-5-8",   /* Victoire 1945 */
  "2026-5-14",  /* Ascension */
  "2026-5-25",  /* Lundi de Pentecôte */
]);

/* Dates explicitement exclues du grisé vacances (format "YYYY-M-D") */
const VACANCE_EXCLUSIONS = new Set([
  "2026-3-8" /* 8 mars — Journée internationale des droits des femmes */,
  "2026-4-8"   /* 8 avril — hors vacances */,
]);

/**
 * Parcourt tous les jours du calendrier et, pour chaque jour marqué "vacances",
 * ajoute les 4 jours ouvrés suivants au Set (même s'ils tombent le mois suivant).
 * Clé : "YYYY-M-D" (ex. "2025-10-15").
 */
function buildVacanceDates() {
  const extras = new Set();
  ORDER.forEach((monthName) => {
    const [y, mo] = META[monthName];
    for (let d = 1; d <= daysIn(y, mo); d++) {
      const dd = getDayData(monthName, d);
      if (!dd || !dd.events) continue;
      const hasVac = Object.values(dd.events).some(
        (ev) => getCategory(ev) === "vacances",
      );
      if (!hasVac) continue;
      /* Ajouter les 4 jours ouvrés qui suivent ce jour */
      const date = new Date(y, mo - 1, d);
      let added = 0;
      while (added < 4) {
        date.setDate(date.getDate() + 1);
        const dow = date.getDay(); /* 0=Di, 6=Sa */
        if (dow !== 0 && dow !== 6) {
          extras.add(
            date.getFullYear() +
              "-" +
              (date.getMonth() + 1) +
              "-" +
              date.getDate(),
          );
          added++;
        }
      }
    }
  });
  return extras;
}

/* Set global calculé une seule fois avant le rendu */
let vacanceDates = new Set();

/* =====================================================================
     MODALE AJOUT D'ÉVÉNEMENT
  ===================================================================== */

/** Ouvre la modale et pré-remplit la date de début avec le jour cliqué */
function openAddEventModal(dateStr) {
  document.getElementById("evtStart").value = dateStr;
  document.getElementById("evtEnd").value = dateStr;
  document.getElementById("evtGroup").value = "";
  document.getElementById("evtTitle").value = "";
  document.getElementById("evtError").textContent = "";
  document
    .querySelectorAll("#evtForm .form-ctrl")
    .forEach((el) => el.classList.remove("invalid"));
  document.getElementById("evtModal").showModal();
}

/** Ferme la modale */
function closeAddEventModal() {
  document.getElementById("evtModal").close();
}

/* =====================================================================
     MODALE DÉTAIL / SUPPRESSION D'ÉVÉNEMENT
  ===================================================================== */

let currentDetailEvt = null; /* { group, text, monthName, day } */

/** Ouvre la modale de détail pour un événement existant */
function openEventDetail(group, text, monthName, day) {
  currentDetailEvt = { group, text, monthName, day };

  /* Formater la date */
  const [y, mo] = META[monthName];
  const date = new Date(y, mo - 1, day);
  const dayNames = [
    "Dimanche",
    "Lundi",
    "Mardi",
    "Mercredi",
    "Jeudi",
    "Vendredi",
    "Samedi",
  ];
  const formatted = dayNames[date.getDay()] + " " + day + " " + monthName;

  document.getElementById("detailGroup").textContent = group;
  document.getElementById("detailGroup").dataset.g = group;
  document.getElementById("detailTitle").textContent = text;
  document.getElementById("detailDate").textContent = formatted;

  /* Revenir à la vue principale (toutes les autres vues masquées) */
  document.getElementById("detailView").hidden = false;
  document.getElementById("confirmView").hidden = true;
  document.getElementById("editView").hidden = true;
  document.getElementById("duplicateView").hidden = true;

  document.getElementById("evtDetailModal").showModal();
}

/** Ferme la modale de détail */
function closeEventDetail() {
  document.getElementById("evtDetailModal").close();
  currentDetailEvt = null;
}

/** Supprime l'événement du groupe pour le jour stocké dans currentDetailEvt */
function deleteEvent() {
  if (!currentDetailEvt) return;
  const { group, monthName, day } = currentDetailEvt;

  const monthData = CAL[monthName];
  if (monthData) {
    const entry = monthData.find((e) => e.day === day);
    if (entry && entry.events) delete entry.events[group];
  }

  /* Reconstruire la section du mois */
  const mc = document.getElementById("monthsContainer");
  const sectionId = "ms-" + monthName.replace(/\s+/g, "-");
  const old = document.getElementById(sectionId);
  if (old) {
    const wasActive = old.classList.contains("active");
    const rebuilt = buildMonthSection(monthName);
    if (wasActive) rebuilt.classList.add("active");
    mc.replaceChild(rebuilt, old);
  }

  persistCAL();
  syncStickyTops();
  closeEventDetail();
}

/** Bascule vers la vue de duplication */
function openDuplicateView() {
  const { group, text } = currentDetailEvt;

  document.getElementById("dupGroup").textContent = group;
  document.getElementById("dupGroup").dataset.g = group;
  document.getElementById("dupTitle").textContent = text;
  document.getElementById("dupStart").value = "";
  document.getElementById("dupEnd").value = "";
  document.getElementById("dupError").textContent = "";
  document
    .querySelectorAll("#dupForm .form-ctrl")
    .forEach((el) => el.classList.remove("invalid"));

  document.getElementById("detailView").hidden = true;
  document.getElementById("confirmView").hidden = true;
  document.getElementById("editView").hidden = true;
  document.getElementById("duplicateView").hidden = false;
}

/** Duplique l'événement sur la nouvelle période choisie */
function saveDuplicate() {
  const start = document.getElementById("dupStart").value;
  const end = document.getElementById("dupEnd").value;
  const errEl = document.getElementById("dupError");

  errEl.textContent = "";
  document
    .querySelectorAll("#dupForm .form-ctrl")
    .forEach((el) => el.classList.remove("invalid"));

  let ok = true;
  if (!start) {
    document.getElementById("dupStart").classList.add("invalid");
    ok = false;
  }
  if (!end) {
    document.getElementById("dupEnd").classList.add("invalid");
    ok = false;
  }
  if (!ok) {
    errEl.textContent = "Veuillez choisir les deux dates.";
    return;
  }
  if (end < start) {
    document.getElementById("dupEnd").classList.add("invalid");
    errEl.textContent = "La date de fin doit être ≥ à la date de début.";
    return;
  }

  const { group, text } = currentDetailEvt;
  const affectedMonths = new Set();
  const cur = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");

  while (cur <= last) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      const y = cur.getFullYear(),
        mo = cur.getMonth() + 1,
        d = cur.getDate();
      const monthName = ORDER.find((mn) => {
        const [my, mm] = META[mn];
        return my === y && mm === mo;
      });
      if (monthName) {
        if (!CAL[monthName]) CAL[monthName] = [];
        let entry = CAL[monthName].find((e) => e.day === d);
        if (!entry) {
          const wdNames = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];
          entry = { day: d, weekday: wdNames[dow], events: {} };
          CAL[monthName].push(entry);
          CAL[monthName].sort((a, b) => a.day - b.day);
        }
        if (!entry.events) entry.events = {};
        entry.events[group] = text;
        affectedMonths.add(monthName);
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  const mc = document.getElementById("monthsContainer");
  affectedMonths.forEach((monthName) => {
    const sectionId = "ms-" + monthName.replace(/\s+/g, "-");
    const old = document.getElementById(sectionId);
    if (old) {
      const wasActive = old.classList.contains("active");
      const rebuilt = buildMonthSection(monthName);
      if (wasActive) rebuilt.classList.add("active");
      mc.replaceChild(rebuilt, old);
    }
  });

  persistCAL();
  syncStickyTops();
  closeEventDetail();
}

/** Bascule vers la vue d'édition en pré-remplissant les champs */
function openEditView() {
  const { group, text, monthName, day } = currentDetailEvt;
  const [y, mo] = META[monthName];
  const dateStr =
    y + "-" + String(mo).padStart(2, "0") + "-" + String(day).padStart(2, "0");

  document.getElementById("editGroup").value = group;
  document.getElementById("editStart").value = dateStr;
  document.getElementById("editEnd").value = dateStr;
  document.getElementById("editTitle").value = text;
  document.getElementById("editError").textContent = "";
  document
    .querySelectorAll("#editForm .form-ctrl")
    .forEach((el) => el.classList.remove("invalid"));

  document.getElementById("detailView").hidden = true;
  document.getElementById("confirmView").hidden = true;
  document.getElementById("editView").hidden = false;
}

/** Valide l'édition, supprime l'ancien événement et enregistre le nouveau */
function saveEdit() {
  const group = document.getElementById("editGroup").value;
  const start = document.getElementById("editStart").value;
  const end = document.getElementById("editEnd").value;
  const title = document.getElementById("editTitle").value.trim();
  const errEl = document.getElementById("editError");

  errEl.textContent = "";
  document
    .querySelectorAll("#editForm .form-ctrl")
    .forEach((el) => el.classList.remove("invalid"));

  let ok = true;
  if (!group) {
    document.getElementById("editGroup").classList.add("invalid");
    ok = false;
  }
  if (!start) {
    document.getElementById("editStart").classList.add("invalid");
    ok = false;
  }
  if (!end) {
    document.getElementById("editEnd").classList.add("invalid");
    ok = false;
  }
  if (!title) {
    document.getElementById("editTitle").classList.add("invalid");
    ok = false;
  }
  if (!ok) {
    errEl.textContent = "Veuillez remplir tous les champs.";
    return;
  }
  if (end < start) {
    document.getElementById("editEnd").classList.add("invalid");
    errEl.textContent = "La date de fin doit être ≥ à la date de début.";
    return;
  }

  /* Supprimer l'ancien événement */
  const {
    group: oldGroup,
    monthName: oldMonth,
    day: oldDay,
  } = currentDetailEvt;
  const oldMonthData = CAL[oldMonth];
  if (oldMonthData) {
    const entry = oldMonthData.find((e) => e.day === oldDay);
    if (entry && entry.events) delete entry.events[oldGroup];
  }
  const affectedMonths = new Set([oldMonth]);

  /* Insérer le nouvel événement jour par jour */
  const cur = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (cur <= last) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      const y = cur.getFullYear(),
        mo = cur.getMonth() + 1,
        d = cur.getDate();
      const monthName = ORDER.find((mn) => {
        const [my, mm] = META[mn];
        return my === y && mm === mo;
      });
      if (monthName) {
        if (!CAL[monthName]) CAL[monthName] = [];
        let entry = CAL[monthName].find((e) => e.day === d);
        if (!entry) {
          const wdNames = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];
          entry = { day: d, weekday: wdNames[dow], events: {} };
          CAL[monthName].push(entry);
          CAL[monthName].sort((a, b) => a.day - b.day);
        }
        if (!entry.events) entry.events = {};
        entry.events[group] = title;
        affectedMonths.add(monthName);
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  /* Reconstruire les sections impactées */
  const mc = document.getElementById("monthsContainer");
  affectedMonths.forEach((monthName) => {
    const sectionId = "ms-" + monthName.replace(/\s+/g, "-");
    const old = document.getElementById(sectionId);
    if (old) {
      const wasActive = old.classList.contains("active");
      const rebuilt = buildMonthSection(monthName);
      if (wasActive) rebuilt.classList.add("active");
      mc.replaceChild(rebuilt, old);
    }
  });

  persistCAL();
  syncStickyTops();
  closeEventDetail();
}

/**
 * Valide le formulaire, injecte l'événement dans CAL pour chaque jour
 * ouvré de la plage, puis reconstruit les sections de mois impactées.
 */
function saveEvent() {
  const group = document.getElementById("evtGroup").value;
  const start = document.getElementById("evtStart").value;
  const end = document.getElementById("evtEnd").value;
  const title = document.getElementById("evtTitle").value.trim();
  const errEl = document.getElementById("evtError");

  /* Réinitialiser */
  errEl.textContent = "";
  document
    .querySelectorAll("#evtForm .form-ctrl")
    .forEach((el) => el.classList.remove("invalid"));

  /* Validation */
  let ok = true;
  if (!group) {
    document.getElementById("evtGroup").classList.add("invalid");
    ok = false;
  }
  if (!start) {
    document.getElementById("evtStart").classList.add("invalid");
    ok = false;
  }
  if (!end) {
    document.getElementById("evtEnd").classList.add("invalid");
    ok = false;
  }
  if (!title) {
    document.getElementById("evtTitle").classList.add("invalid");
    ok = false;
  }
  if (!ok) {
    errEl.textContent = "Veuillez remplir tous les champs.";
    return;
  }
  if (end < start) {
    document.getElementById("evtEnd").classList.add("invalid");
    errEl.textContent = "La date de fin doit être ≥ à la date de début.";
    return;
  }

  /* Injection dans CAL jour par jour (weekends ignorés) */
  const affectedMonths = new Set();
  const cur = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");

  while (cur <= last) {
    const dow = cur.getDay(); /* 0=Di, 6=Sa */
    if (dow !== 0 && dow !== 6) {
      const y = cur.getFullYear();
      const mo = cur.getMonth() + 1;
      const d = cur.getDate();
      const monthName = ORDER.find((mn) => {
        const [my, mm] = META[mn];
        return my === y && mm === mo;
      });
      if (monthName) {
        if (!CAL[monthName]) CAL[monthName] = [];
        let entry = CAL[monthName].find((e) => e.day === d);
        if (!entry) {
          const wdNames = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];
          entry = { day: d, weekday: wdNames[dow], events: {} };
          CAL[monthName].push(entry);
          CAL[monthName].sort((a, b) => a.day - b.day);
        }
        if (!entry.events) entry.events = {};
        entry.events[group] = title;
        affectedMonths.add(monthName);
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  /* Reconstruction des sections impactées */
  const mc = document.getElementById("monthsContainer");
  affectedMonths.forEach((monthName) => {
    const sectionId = "ms-" + monthName.replace(/\s+/g, "-");
    const old = document.getElementById(sectionId);
    if (old) {
      const wasActive = old.classList.contains("active");
      const rebuilt = buildMonthSection(monthName);
      if (wasActive) rebuilt.classList.add("active");
      mc.replaceChild(rebuilt, old);
    }
  });

  persistCAL();
  syncStickyTops();
  closeAddEventModal();
}

/* =====================================================================
     INJECTION DES JOURS FÉRIÉS DANS CAL
  ===================================================================== */

/**
 * Injecte les jours fériés comme événements du groupe "Férié" dans CAL,
 * avant le rendu, pour qu'ils apparaissent comme une pill dans les cellules.
 */
function injectFeries() {
  const ferieEvents = new Map([
    ["2025-11-1",  "Toussaint"],
    ["2025-11-11", "Armistice"],
    ["2026-1-1",   "Jour de l'an"],
    ["2026-4-6",   "Lundi de Pâques"],
    ["2026-5-1",   "Fête du Travail"],
    ["2026-5-8",   "Victoire 1945"],
    ["2026-5-14",  "Ascension"],
    ["2026-5-25",  "Lundi de Pentecôte"],
  ]);

  /* Table de correspondance "YYYY-M" → nom du mois */
  const monthByYM = {};
  ORDER.forEach((monthName) => {
    const [y, mo] = META[monthName];
    monthByYM[y + "-" + mo] = monthName;
  });

  ferieEvents.forEach((label, dateKey) => {
    const [y, mo, d] = dateKey.split("-").map(Number);
    const monthName = monthByYM[y + "-" + mo];
    if (!monthName) return;
    if (!CAL[monthName]) CAL[monthName] = [];
    let entry = CAL[monthName].find((e) => e.day === d);
    if (!entry) {
      entry = { day: d, events: {} };
      CAL[monthName].push(entry);
      CAL[monthName].sort((a, b) => a.day - b.day);
    }
    if (!entry.events) entry.events = {};
    entry.events["Férié"] = label;
  });
}

/* =====================================================================
     INITIALISATION
  ===================================================================== */
async function init() {
  /* 0. Charger les données depuis calendar_data.json */
  CAL_BASE = await fetch("calendar_data.json").then((r) => r.json());
  /* Copie profonde dans CAL */
  CAL = JSON.parse(JSON.stringify(CAL_BASE));
  /* Migrer l'ancienne clé cal_data si elle existe */
  try { localStorage.removeItem("cal_data"); } catch {}
  /* Appliquer le delta sauvegardé (modifications utilisateur) */
  CAL_DELTA = loadDelta();
  applyDelta();

  /* 1. Construire les filtres de groupes */
  buildFilters();

  /* 2. Construire la navigation par mois */
  buildNav();

  /* 2b. Injecter les jours fériés dans CAL avant le rendu */
  injectFeries();

  /* 2c. Pré-calculer les jours grisés vacances (avant buildMonthSection) */
  vacanceDates = buildVacanceDates();

  /* 3. Construire toutes les sections mois */
  const mc = document.getElementById("monthsContainer");
  ORDER.forEach((month) => mc.appendChild(buildMonthSection(month)));

  /* 4. Construire la vue annuelle */
  buildYearView();

  /* 5. Afficher le mois courant (ou le 1er mois si l'année n'a pas commencé) */
  const now = new Date();
  let initMonth = ORDER[0];
  ORDER.forEach((m) => {
    const [y, mo] = META[m];
    if (now.getFullYear() === y && now.getMonth() + 1 === mo) {
      initMonth = m;
    }
  });
  currentMonth = initMonth;
  goToMonth(initMonth);

  /* 6. Synchroniser les hauteurs sticky (mesure réelle des éléments) */
  syncStickyTops();
  window.addEventListener("resize", syncStickyTops);

  /* 7. Modale détail / suppression */
  document
    .getElementById("detailCloseBtn")
    .addEventListener("click", closeEventDetail);
  document
    .getElementById("detailDuplicateBtn")
    .addEventListener("click", openDuplicateView);
  document.getElementById("dupCancelBtn").addEventListener("click", () => {
    document.getElementById("duplicateView").hidden = true;
    document.getElementById("detailView").hidden = false;
  });
  document.getElementById("dupOkBtn").addEventListener("click", saveDuplicate);
  document.getElementById("dupForm").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); saveDuplicate(); }
  });
  document
    .getElementById("detailEditBtn")
    .addEventListener("click", openEditView);
  document.getElementById("detailDeleteBtn").addEventListener("click", () => {
    document.getElementById("detailView").hidden = true;
    document.getElementById("confirmView").hidden = false;
  });
  document.getElementById("confirmCancelBtn").addEventListener("click", () => {
    document.getElementById("detailView").hidden = false;
    document.getElementById("confirmView").hidden = true;
  });
  document
    .getElementById("confirmOkBtn")
    .addEventListener("click", deleteEvent);
  document.getElementById("editCancelBtn").addEventListener("click", () => {
    document.getElementById("editView").hidden = true;
    document.getElementById("detailView").hidden = false;
  });
  document.getElementById("editOkBtn").addEventListener("click", saveEdit);
  document.getElementById("editForm").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    }
  });
  document.getElementById("evtDetailModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("evtDetailModal"))
      closeEventDetail();
  });

  /* 8. Modale ajout d'événement */
  document.getElementById("evtOk").addEventListener("click", saveEvent);
  document
    .getElementById("evtCancel")
    .addEventListener("click", closeAddEventModal);
  /* Clic sur le backdrop natif du <dialog> → fermeture */
  document.getElementById("evtModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("evtModal")) closeAddEventModal();
  });
  /* Entrée dans le formulaire → valider */
  document.getElementById("evtForm").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEvent();
    }
  });
}

/**
 * Mesure les hauteurs réelles des en-têtes fixes et met à jour les
 * propriétés CSS --h-header / --h-toolbar / --h-month.
 * À appeler après le rendu initial et à chaque redimensionnement.
 */
function syncStickyTops() {
  const r = document.documentElement;
  const header = document.querySelector(".app-header");
  const toolbar = document.querySelector(".toolbar");
  const mhdr =
    document.querySelector(".month-section.active .month-hdr") ||
    document.querySelector(".month-hdr");

  if (header) r.style.setProperty("--h-header", header.offsetHeight + "px");
  if (toolbar) r.style.setProperty("--h-toolbar", toolbar.offsetHeight + "px");
  if (mhdr) r.style.setProperty("--h-month", mhdr.offsetHeight + "px");
}

/* Démarrage après chargement du DOM */
document.addEventListener("DOMContentLoaded", init);
