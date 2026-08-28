import type { Strings } from './en';

/**
 * U+00A0 NO-BREAK SPACE, built from its code point rather than typed.
 *
 * French typography puts a space before `:`, `;`, `?` and `!`, and inside
 * « … », and that space must not wrap onto the next line — a line beginning with
 * a lone colon is the giveaway that an ordinary space was used.
 *
 * It is a named constant and not a literal character for three practical
 * reasons: a raw no-break space is invisible in a diff, indexes as an ordinary
 * space when someone greps for the phrase, and is silently normalised by any
 * editor set to strip odd whitespace. `${NB}` survives all three, and a reviewer
 * can see the intent without having to hexdump the line to find it. ESLint's
 * `no-irregular-whitespace` also rejects the raw character in a comment, so it
 * could not be demonstrated here even if that were preferable.
 */
const NB = String.fromCharCode(0xa0);

/**
 * French.
 *
 * Addressed as *vous* throughout — the only defensible form for a public service
 * speaking to a visitor it has never met.
 *
 * One further choice worth recording, because it looks like a mistake to a
 * reviewer checking word by word: **"conversation id" is "numéro de
 * conversation"**, not "identifiant". *Identifiant* is what a French speaker
 * types into a login box, and this string exists to say the thing is *not* a
 * login. The less technical word is the more accurate one here.
 *
 * Untranslated on purpose: the facility names, "SCASPA", and the assistant's own
 * answers. See `locales.ts`.
 */
export const fr: Strings = {
  sidebar: {
    askAbout: 'Poser une question sur',
    newConversation: 'Nouvelle conversation',
    sourcesInConversation: 'Sources de cette conversation',
    aboutScaspa: 'À propos de SCASPA',
    talkToPerson: 'Parler à une personne',
    settings: 'Paramètres',
    settingsHint: 'Langue et accessibilité',
    collapseNav: 'Réduire la navigation',
    expandNav: 'Développer la navigation',
    verifiedAsOf: 'Informations vérifiées le',
  },

  settings: {
    title: 'Paramètres',
    intro:
      'L’apparence de cet assistant, ce qu’il conserve sur votre appareil et où trouver de l’aide.',
    onThisPage: 'Sur cette page',
    backToAssistant: 'Assistant',

    appearance: {
      heading: 'Apparence',
      lead: 'Si cette application s’affiche en clair ou en sombre. Cela ne change pas les réponses.',
      legend: 'Thème',
      options: {
        light: { label: 'Clair', hint: 'Fond clair' },
        dark: { label: 'Sombre', hint: 'Fond sombre' },
        system: { label: 'Système', hint: 'Suivre mon appareil' },
      },
      saved: 'Thème enregistré sur cet appareil.',
      storedNote:
        'Conservé uniquement sur cet appareil. Rien concernant votre choix n’est envoyé à SCASPA.',
    },

    language: {
      heading: 'Langue',
      lead: 'La langue des boutons, des menus et des libellés de cette application.',
      legend: 'Langue de l’interface',
      scopeTitle: 'Les réponses suivent votre question, pas ce réglage',
      scopeBody:
        'Ce réglage change les boutons, les menus et les libellés de l’application. L’assistant répond dans la langue dans laquelle vous lui écrivez' +
        `${NB}: posez la question en français et la réponse arrive en français, quelle que soit la langue choisie ici. Les informations vérifiées de SCASPA sont publiées en anglais et chaque chiffre est cité exactement tel qu’il a été publié, de sorte que les montants et les horaires gardent la forme que la source leur a donnée. Le personnel peut vous aider par téléphone dans d’autres langues.`,
      saved: 'Langue enregistrée sur cet appareil.',
      storedNote:
        'Enregistrée sur cet appareil uniquement. Rien concernant votre choix n’est transmis à SCASPA.',
    },

    accessibility: {
      heading: 'Accessibilité',
      lead: `L’essentiel est déjà réglé${NB}: sur votre appareil, une seule fois, pour toutes vos applications.`,
      followsDevice: 'Suit votre appareil',
      builtIn: 'Toujours actif',
      contrastTitle: 'Contraste renforcé',
      contrastBody:
        'Activez le contraste élevé dans les réglages de votre appareil et cette application augmentera le sien pour s’y accorder. Sur iOS, voyez Accessibilité → Affichage et taille du texte' +
        `${NB}; sur Android, Accessibilité${NB}; sur ordinateur, les réglages d’affichage ou d’accessibilité.`,
      motionTitle: 'Animations réduites',
      motionBody:
        'Activez la réduction des animations et tout mouvement s’arrête ici' +
        `${NB}: les panneaux coulissants, l’indicateur de saisie et les menus qui se déplient.`,
      textTitle: 'Texte plus grand',
      textBody:
        'Cette application est construite en unités relatives' +
        `${NB}: le zoom de votre navigateur comme le réglage de taille du texte de votre appareil fonctionnent sans que rien ne se chevauche ni ne soit coupé.`,
      keyboardTitle: 'Clavier et lecteur d’écran',
      keyboardBody:
        'Chaque commande est accessible à la touche Tab et affiche un contour de focus visible. Chaque page s’ouvre sur un lien permettant d’aller directement au contenu principal, et une réponse terminée est annoncée au lieu d’apparaître en silence.',
      whyNoSwitchTitle: 'Pourquoi il n’y a pas d’interrupteur sur cette page',
      whyNoSwitchBody:
        'Un interrupteur ici ne vaudrait que pour ce seul site, et il faudrait le retrouver sur tous les autres. Réglez-le une fois sur votre appareil et tout le respecte, y compris cette application — sans que rien n’ait à être conservé ici pour s’en souvenir.',
    },

    history: {
      heading: 'Historique des conversations',
      lead: 'Ce qui est conservé, où, et comment l’effacer.',
      onDeviceTitle: 'Sur cet appareil',
      onDeviceBody:
        'Un numéro de conversation anonyme, pour que le rechargement de la page ne vous fasse pas perdre le fil. Ni questions, ni réponses, ni nom. Il disparaît à la fermeture de l’onglet.',
      onServerTitle: 'Sur le serveur',
      onServerBody:
        'Le texte de votre conversation en cours, gardé en mémoire pour qu’une question de suivi garde son sens. Sa longueur est plafonnée et il est supprimé au bout d’une heure. Rien n’y permet de vous identifier.',
      neverTitle: 'Jamais conservé',
      neverBody:
        'Vos messages ne sont jamais écrits sur cet appareil. Votre adresse IP, votre voix et tout autre élément permettant de vous identifier ne sont jamais journalisés.',
      clearTitle: 'Effacer cette conversation',
      clearBody:
        'Oublie le numéro de conversation et vide la zone de message. Votre prochaine question repart de zéro.',
      clearAction: 'Démarrer une nouvelle conversation',
      cleared: 'Effacé. Votre prochaine question démarrera une nouvelle conversation.',
      resetTitle: 'Réinitialiser cet appareil',
      resetBody:
        'Efface d’un coup la conversation et la langue enregistrée. À faire sur un appareil partagé ou public avant de vous en aller.',
      resetAction: 'Tout réinitialiser',
      resetDone: 'Réinitialisé. La langue est revenue à l’anglais.',
      noListTitle: 'Il n’y a aucune liste de conversations passées',
      noListBody:
        'Ce n’est pas un oubli' +
        `${NB}: il n’y a rien à lister. Les conversations ne sont jamais écrites sur votre appareil et expirent sur le serveur${NB}; il n’existe donc ici aucun historique que quiconque puisse consulter, SCASPA comprise.`,
    },

    support: {
      heading: 'Aide et assistance',
      lead: 'Quand l’assistant ne peut pas répondre, ces solutions le peuvent.',
      callTitle: 'Appeler SCASPA',
      callBody:
        'La voie la plus rapide pour tout ce qui concerne une expédition, une réservation ou un paiement précis — précisément ce qu’un assistant sans compte ne peut pas consulter.',
      ticketTitle: 'Laisser un message au guichet',
      ticketBody:
        'Décrivez le problème et recevez un numéro de référence à citer. Aucun nom ni adresse e-mail n’est demandé, et personne ne vous contactera de lui-même.',
      ticketAction: 'Contacter l’assistance',
      privacyTitle: 'Ce qui est conservé, et ce qui ne l’est pas',
      privacyBody: 'La note de confidentialité complète, en langage clair.',
      privacyAction: 'Lire la note de confidentialité',
      tipsTitle: 'Obtenir une meilleure réponse',
      // « … » takes a no-break space on the inside of each guillemet.
      tip1:
        'Nommez le lieu. Le port de commerce, le quai de croisière, la gare maritime et l’aéroport sont quatre exploitations distinctes, et en nommer une trouve bien plus que ' +
        `«${NB}le port${NB}».`,
      tip2: 'Posez une seule question à la fois. Deux questions dans un même message donnent souvent une bonne réponse et une autre survolée.',
      tip3: 'Vérifiez la source sous chaque réponse. Chaque affirmation renvoie à la fiche SCASPA dont elle provient, avec la date à laquelle elle a été vérifiée.',
    },

    about: {
      heading: 'À propos de cet assistant',
      lead: 'Ce qu’il est, et ce qu’il ne fera pas.',
      whatTitle: 'Ce qu’il est',
      whatBody:
        'Un assistant de la St. Christopher Air & Sea Ports Authority, couvrant Deep Water Harbour, Port Zante, Basseterre Ferry Terminal et Robert L. Bradshaw International Airport.',
      rulesTitle: 'Les règles qu’il respecte',
      rule1: 'Il ne répond qu’à partir d’informations SCASPA vérifiées.',
      rule2: 'Chaque affirmation cite la fiche dont elle provient.',
      rule3:
        'Il n’invente jamais un horaire, un tarif ni une règle. Lorsqu’il ne sait pas, il le dit et vous oriente vers quelqu’un qui sait.',
      rule4: 'Il n’a ni compte ni connexion, et ne sait jamais qui pose la question.',
      orgTitle: 'À propos de SCASPA',
      orgBody: 'L’organisation, ses quatre installations et comment joindre chacune d’elles.',
      orgAction: 'À propos de SCASPA',
    },
  },

  nav: {
    groups: {
      askPilot: 'Interroger Pilot',
      operations: 'Opérations',
      help: 'Aide',
      tools: 'Outils',
    },
    items: {
      chat: 'Chat',
      vessels: 'Navires',
      flights: 'Vols',
      tariffs: 'Tarifs',
      cargo: 'Fret',
      contactScaspa: 'Contacter SCASPA',
      console: 'Console',
    },
  },

  shell: {
    skipToConversation: 'Aller à la conversation',
    openNavigation: 'Ouvrir la navigation',
    closeNavigation: 'Fermer la navigation',
    navigation: 'Navigation',
    sections: 'Sections',
    showSources: 'Afficher les sources',
    sources: 'Sources',
    telephoneAuthority: "Téléphoner à l'Autorité",
    aboutScaspa: 'À propos de SCASPA',
    accessibility: 'Accessibilité',
    homeLink: 'SCASPA — St. Christopher Air and Sea Ports Authority, accueil',
    search: 'Rechercher',
    searchLabel: 'Rechercher dans la navigation et les questions de cette session',
    recordedQuestions: 'Questions enregistrées',
    demonstrationProfile: 'Profil de démonstration',
    /* Indique que l'application fonctionne, pas que le serveur répond. */
    online: 'En ligne',
  },

  sources: {
    lead: 'Chaque information indique son origine et la date à laquelle elle a été vérifiée.',
    emptyTitle: 'Rien à afficher pour le moment',
    emptyBody:
      "Les sources apparaissent ici dès qu'une réponse arrive. Chacune renvoie à la page SCASPA dont elle provient.",
    snapshotNote:
      "L'information est un instantané, pas un flux en direct. La date indiquée ici est celle de la dernière vérification, et non la confirmation que le fait est toujours exact aujourd'hui.",
  },

  errors: {
    notFoundTitle: 'Page introuvable',
    notFoundBody:
      "Nous n'avons pas trouvé cette page. Vérifiez l'adresse, ou revenez en arrière et interrogez l'assistant.",
    backToAssistant: "Revenir à l'assistant",
    routeErrorTitle: 'Un problème est survenu sur cette page',
    routeErrorBody:
      "L'erreur vient de nous, pas de vous. Démarrer une nouvelle conversation suffit généralement.",
    startNewConversation: 'Démarrer une nouvelle conversation',
    reloadPage: 'Recharger la page',
    reachDirectly: 'Ou contactez directement SCASPA',
  },
};
