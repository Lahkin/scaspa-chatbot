/**
 * The English strings, and the shape every other language must fill.
 *
 * `Strings` is derived from this object with `typeof`, and each translation is
 * declared `satisfies Strings`. So a key added here breaks the build in `es.ts`
 * and `fr.ts` until it is translated, rather than silently rendering `undefined`
 * to whoever chose that language — which is the failure mode of every runtime
 * `t('some.key')` lookup and the reason this is a plain nested object instead.
 *
 * ## What is not in here
 *
 * Anything that is not this app's own chrome:
 *
 * - **Assistant answers and citations.** English by rule — see `locales.ts`.
 * - **The facility starter questions.** They are sent verbatim to an
 *   English-language retriever; a Spanish question matches nothing and returns
 *   "I don't know" to someone who asked a perfectly good question.
 * - **Proper nouns.** "Port Zante" is a place, not a phrase. Translating a name
 *   someone will read off a sign or a ticket helps nobody.
 */

export const en = {
  sidebar: {
    askAbout: 'Ask about',
    newConversation: 'New conversation',
    sourcesInConversation: 'Sources in this conversation',
    aboutScaspa: 'About SCASPA',
    talkToPerson: 'Talk to a person',
    settings: 'Settings',
    /*
     * Not "…, history", which is the obvious third word and is wrong here.
     *
     * `sidebar.test.tsx` fails the build if the word "history" appears anywhere
     * in this sidebar, and the rule is worth more than the word: a nav entry
     * offering "history" reads as "your past conversations are in here", and
     * there are none — never written to the device, expired on the server. The
     * settings page has a Chat history section that explains exactly that, but
     * a user who followed the word to find their transcripts has already been
     * misled by the time they arrive.
     *
     * Two items and not three, because the third truncated. The rail is 260px
     * and this line is `truncate`, so "Language, accessibility, help" rendered
     * as "Language, accessibility, h…" — an ellipsis mid-word reads as a layout
     * bug rather than as a list that continues. Every translation has to clear
     * the same bar; French is the longest of the three and is the one to check
     * when adding a fourth language.
     */
    settingsHint: 'Language and accessibility',
    collapseNav: 'Collapse navigation',
    expandNav: 'Expand navigation',
    verifiedAsOf: 'Information verified as of',
  },

  settings: {
    title: 'Settings',
    intro: 'How this assistant looks, what it keeps on your device, and where to get help.',
    onThisPage: 'On this page',
    backToAssistant: 'Assistant',

    appearance: {
      heading: 'Appearance',
      lead: 'Whether this app is light or dark. It does not change the answers.',
      legend: 'Theme',
      options: {
        light: { label: 'Light', hint: 'Bright background' },
        dark: { label: 'Dark', hint: 'Dark background' },
        system: { label: 'System', hint: 'Follow my device' },
      },
      saved: 'Theme saved on this device.',
      storedNote: 'Stored on this device only. Nothing about your choice is sent to SCASPA.',
    },

    language: {
      heading: 'Language',
      lead: "The language of this app's buttons, menus and labels.",
      legend: 'Interface language',
      /*
       * This pair used to read "Answers stay in English", and it was true when
       * it was written. It is not any more: the assistant replies in whatever
       * language the question was asked in, and rule 10 now holds across
       * languages — `app/rag/figures.py`.
       *
       * The distinction the copy has to carry is subtle and matters: this
       * control sets the **interface** language, and the answer follows the
       * **question**. Someone who sets Spanish here and then types in English
       * gets an English answer, and should not be surprised by that.
       */
      scopeTitle: 'Answers follow your question, not this setting',
      scopeBody:
        "This changes the app's own buttons, menus and labels. The assistant replies in whatever language you write to it in — ask in Spanish and the answer comes back in Spanish, whichever language is chosen here. SCASPA's verified information is published in English, and every figure is quoted exactly as published, so amounts and times keep the form the source gave them. Staff on the phone can help in other languages.",
      saved: 'Language saved on this device.',
      storedNote: 'Stored on this device only. Nothing about your choice is sent to SCASPA.',
    },

    accessibility: {
      heading: 'Accessibility',
      lead: 'Most of this is already set — by your device, once, for every app you use.',
      followsDevice: 'Follows your device',
      builtIn: 'Always on',
      contrastTitle: 'Higher contrast',
      contrastBody:
        'Turn on increased contrast in your device settings and this app raises its own contrast to match. On iOS look under Accessibility → Display & Text Size; on Android under Accessibility; on a desktop under display or accessibility settings.',
      motionTitle: 'Reduced motion',
      motionBody:
        'Turn on reduced motion and every animation here stops — the sliding panels, the typing indicator, the expanding menus.',
      textTitle: 'Larger text',
      textBody:
        "This app is built in relative units, so your browser's zoom and your device's text-size setting both work without anything overlapping or being cut off.",
      keyboardTitle: 'Keyboard and screen reader',
      keyboardBody:
        'Every control is reachable with the Tab key and shows a visible focus ring. Each page opens with a skip link straight to the main content, and a finished answer is announced rather than appearing silently.',
      whyNoSwitchTitle: 'Why there is no switch on this page',
      whyNoSwitchBody:
        'A switch here would apply to this one website, and you would have to find it again on every other one. Set it once on your device and everything respects it, including this app — with nothing stored here to remember it.',
    },

    history: {
      heading: 'Chat history',
      lead: 'What is kept, where it is kept, and how to clear it.',
      onDeviceTitle: 'On this device',
      onDeviceBody:
        'One anonymous conversation number, so reloading the page does not lose your place. No questions, no answers, no name. It goes when you close the tab.',
      onServerTitle: 'On the server',
      onServerBody:
        'The text of your current conversation, held in memory so a follow-up question still makes sense. It is capped in length and discarded after an hour. Nothing in it identifies you.',
      neverTitle: 'Never kept',
      neverBody:
        'Your messages are never written to this device. Your IP address, your voice, and anything else that could identify you are never logged.',
      clearTitle: 'Clear this conversation',
      clearBody:
        'Forgets the conversation number and empties the message box. Your next question starts fresh.',
      clearAction: 'Start a new conversation',
      cleared: 'Cleared. Your next question starts a new conversation.',
      resetTitle: 'Reset this device',
      resetBody:
        'Clears the conversation and your saved language together. Worth doing on a shared or public device before you walk away.',
      resetAction: 'Reset everything',
      resetDone: 'Reset. The language is back to English.',
      noListTitle: 'There is no list of past conversations',
      noListBody:
        'Not an omission — there is nothing to list. Conversations are never written to your device and expire on the server, so there is no history here for anyone to look back through, including SCASPA.',
    },

    support: {
      heading: 'Help and support',
      lead: 'When the assistant cannot answer, these can.',
      callTitle: 'Call SCASPA',
      callBody:
        'The fastest route for anything about a specific shipment, booking or payment — the things an assistant with no sign-in cannot see.',
      ticketTitle: 'Leave a note for the desk',
      ticketBody:
        'Describe the problem and get a reference number to quote. No name or email address is asked for, and nobody will contact you first.',
      ticketAction: 'Contact support',
      privacyTitle: 'What is and is not stored',
      privacyBody: 'The full privacy note, in plain words.',
      privacyAction: 'Read the privacy note',
      tipsTitle: 'Getting a better answer',
      tip1: 'Name the place. The cargo harbour, the cruise pier, the ferry terminal and the airport are four different operations, and naming one finds far more than "the port".',
      tip2: 'Ask one thing at a time. Two questions in one message usually get one answered well and one glossed over.',
      tip3: 'Check the source under an answer. Every factual claim links to the SCASPA record it came from, with the date that record was verified.',
    },

    about: {
      heading: 'About this assistant',
      lead: 'What it is, and what it will not do.',
      whatTitle: 'What it is',
      whatBody:
        'An assistant for the St. Christopher Air & Sea Ports Authority, covering Deep Water Harbour, Port Zante, Basseterre Ferry Terminal and Robert L. Bradshaw International Airport.',
      rulesTitle: 'The rules it works under',
      rule1: 'It answers only from verified SCASPA information.',
      rule2: 'Every factual claim cites the record it came from.',
      rule3:
        'It never invents a schedule, a fee or a rule. When it does not know, it says so and points you to someone who does.',
      rule4: 'It has no sign-in, no account, and never learns who is asking.',
      orgTitle: 'About SCASPA itself',
      orgBody: 'The organisation, its four facilities, and how to reach each of them.',
      orgAction: 'About SCASPA',
    },
  },

  /*
   * Navigation.
   *
   * The group labels and item labels only. The `href`s and icons stay in
   * `Sidebar.tsx`, because a route is not a string a translator should be able
   * to change — a mistranslated `/tariffs` is a 404, and it would be found by a
   * user rather than by the build.
   *
   * "Pilot" is the product's name and is not translated, for the same reason
   * "Port Zante" is not: it is what the thing is called.
   */
  nav: {
    groups: {
      askPilot: 'Ask Pilot',
      operations: 'Operations',
      help: 'Help',
      tools: 'Tools',
    },
    items: {
      chat: 'Chat',
      vessels: 'Vessels',
      flights: 'Flights',
      tariffs: 'Tariffs',
      cargo: 'Cargo',
      contactScaspa: 'Contact SCASPA',
      console: 'Console',
    },
  },

  /* The frame every screen sits in: skip link, rails, drawer, sheet. */
  shell: {
    skipToConversation: 'Skip to the conversation',
    openNavigation: 'Open navigation',
    closeNavigation: 'Close navigation',
    navigation: 'Navigation',
    sections: 'Sections',
    showSources: 'Show sources',
    sources: 'Sources',
    telephoneAuthority: 'Telephone the Authority',
    aboutScaspa: 'About SCASPA',
    accessibility: 'Accessibility',
    /* The organisation's name is never translated; only "home" is a label. */
    homeLink: 'SCASPA — St. Christopher Air and Sea Ports Authority, home',
    search: 'Search',
    searchLabel: "Search the navigation and this session's questions",
    recordedQuestions: 'Recorded questions',
    demonstrationProfile: 'Demonstration profile',
    /*
     * "Online" means the interface, not the server — `Sidebar.tsx` explains why
     * the dot cannot claim more than that. Translations must not promise a
     * connection either: "Conectado" and "En ligne" say the app is running, and
     * neither reads as "the service is reachable".
     */
    online: 'Online',
  },

  sources: {
    lead: 'Every factual claim shows where it came from and the date it was verified.',
    emptyTitle: 'Nothing to show yet',
    emptyBody:
      'Citations appear here once an answer arrives. Each one links to the SCASPA page it came from.',
    snapshotNote:
      'Information is a snapshot, not a live feed. A date shown here is when that fact was last checked — not confirmation that it is still true today.',
  },

  errors: {
    notFoundTitle: 'Page not found',
    notFoundBody:
      'We could not find that page. Check the address, or go back and ask the assistant.',
    backToAssistant: 'Back to the assistant',
    routeErrorTitle: 'Something went wrong on this page',
    routeErrorBody: 'That is our fault, not yours. Starting a new conversation usually clears it.',
    startNewConversation: 'Start a new conversation',
    reloadPage: 'Reload the page',
    reachDirectly: 'Or reach SCASPA directly',
  },
};

/**
 * The contract every translation fills. Derived, so it can never drift from it.
 *
 * Note the absence of `as const` on the object above, which is load-bearing
 * rather than an oversight: with it, every property's type would be its own
 * literal — `askAbout: 'Ask about'` — and `es.ts` would be required to say
 * "Ask about" in Spanish to satisfy the type. Widened to `string`, the type
 * checks the *shape*, which is the thing worth checking.
 */
export type Strings = typeof en;
