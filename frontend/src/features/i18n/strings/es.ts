import type { Strings } from './en';

/**
 * Spanish.
 *
 * Translated for a traveller, not for a port officer: "conversation id" becomes
 * "número de conversación" rather than "identificador", because the string is
 * read by someone finding out what a website kept about them, and the precise
 * word costs comprehension without buying accuracy.
 *
 * Neutral Latin American Spanish, addressing the reader as *usted*. The traffic
 * through Port Zante and the ferry terminal is overwhelmingly Caribbean and North
 * American rather than peninsular, and *usted* is the form that reads as ordinary
 * courtesy across the whole region rather than as stiffness in one half of it.
 *
 * Untranslated on purpose: the facility names, "SCASPA", and the assistant's own
 * answers. See `locales.ts`.
 */
export const es: Strings = {
  sidebar: {
    askAbout: 'Consultar sobre',
    newConversation: 'Nueva conversación',
    sourcesInConversation: 'Fuentes de esta conversación',
    aboutScaspa: 'Acerca de SCASPA',
    talkToPerson: 'Hablar con una persona',
    settings: 'Configuración',
    settingsHint: 'Idioma y accesibilidad',
    collapseNav: 'Contraer la navegación',
    expandNav: 'Expandir la navegación',
    verifiedAsOf: 'Información verificada el',
  },

  settings: {
    title: 'Configuración',
    intro:
      'La apariencia de este asistente, lo que guarda en su dispositivo y dónde obtener ayuda.',
    onThisPage: 'En esta página',
    backToAssistant: 'Asistente',

    appearance: {
      heading: 'Apariencia',
      lead: 'Si esta aplicación se ve clara u oscura. No cambia las respuestas.',
      legend: 'Tema',
      options: {
        light: { label: 'Claro', hint: 'Fondo claro' },
        dark: { label: 'Oscuro', hint: 'Fondo oscuro' },
        system: { label: 'Sistema', hint: 'Seguir mi dispositivo' },
      },
      saved: 'Tema guardado en este dispositivo.',
      storedNote:
        'Se guarda solo en este dispositivo. No se envía nada sobre su elección a SCASPA.',
    },

    language: {
      heading: 'Idioma',
      lead: 'El idioma de los botones, menús y etiquetas de esta aplicación.',
      legend: 'Idioma de la interfaz',
      scopeTitle: 'Las respuestas siguen a su pregunta, no a esta opción',
      scopeBody:
        'Esto cambia los botones, menús y etiquetas de la aplicación. El asistente responde en el idioma en que usted le escriba: si pregunta en español, la respuesta llega en español, sea cual sea el idioma elegido aquí. La información verificada de SCASPA se publica en inglés y cada cifra se cita exactamente como fue publicada, de modo que los importes y las horas conservan la forma que les dio la fuente. El personal puede atenderle por teléfono en otros idiomas.',
      saved: 'Idioma guardado en este dispositivo.',
      storedNote:
        'Se guarda solo en este dispositivo. No se envía nada sobre su elección a SCASPA.',
    },

    accessibility: {
      heading: 'Accesibilidad',
      lead: 'Casi todo esto ya está configurado: en su dispositivo, una sola vez, para todas las aplicaciones.',
      followsDevice: 'Sigue su dispositivo',
      builtIn: 'Siempre activo',
      contrastTitle: 'Mayor contraste',
      contrastBody:
        'Active el contraste aumentado en la configuración de su dispositivo y esta aplicación aumentará el suyo para que coincida. En iOS busque en Accesibilidad → Pantalla y tamaño de texto; en Android, en Accesibilidad; en un ordenador, en la configuración de pantalla o accesibilidad.',
      motionTitle: 'Movimiento reducido',
      motionBody:
        'Active el movimiento reducido y aquí se detendrán todas las animaciones: los paneles deslizantes, el indicador de escritura y los menús desplegables.',
      textTitle: 'Texto más grande',
      textBody:
        'Esta aplicación usa unidades relativas, así que tanto el zoom de su navegador como el tamaño de texto de su dispositivo funcionan sin que nada se superponga ni se corte.',
      keyboardTitle: 'Teclado y lector de pantalla',
      keyboardBody:
        'Se puede llegar a cada control con la tecla Tab y todos muestran un indicador de foco visible. Cada página empieza con un enlace para saltar directamente al contenido principal, y las respuestas terminadas se anuncian en vez de aparecer en silencio.',
      whyNoSwitchTitle: 'Por qué no hay un interruptor en esta página',
      whyNoSwitchBody:
        'Un interruptor aquí solo valdría para este sitio web, y tendría que volver a buscarlo en todos los demás. Actívelo una vez en su dispositivo y todo lo respetará, incluida esta aplicación, sin que haga falta guardar nada aquí para recordarlo.',
    },

    history: {
      heading: 'Historial del chat',
      lead: 'Qué se guarda, dónde se guarda y cómo borrarlo.',
      onDeviceTitle: 'En este dispositivo',
      onDeviceBody:
        'Un número de conversación anónimo, para que al recargar la página no pierda su sitio. Ni preguntas, ni respuestas, ni nombre. Se borra al cerrar la pestaña.',
      onServerTitle: 'En el servidor',
      onServerBody:
        'El texto de su conversación actual, guardado en memoria para que una pregunta de seguimiento siga teniendo sentido. Tiene un límite de longitud y se descarta al cabo de una hora. Nada en él le identifica.',
      neverTitle: 'Nunca se guarda',
      neverBody:
        'Sus mensajes nunca se escriben en este dispositivo. Su dirección IP, su voz y cualquier otro dato que pudiera identificarle nunca se registran.',
      clearTitle: 'Borrar esta conversación',
      clearBody:
        'Olvida el número de conversación y vacía el cuadro de mensaje. Su próxima pregunta empieza de cero.',
      clearAction: 'Empezar una conversación nueva',
      cleared: 'Borrado. Su próxima pregunta empezará una conversación nueva.',
      resetTitle: 'Restablecer este dispositivo',
      resetBody:
        'Borra a la vez la conversación y el idioma guardado. Conviene hacerlo en un dispositivo compartido o público antes de marcharse.',
      resetAction: 'Restablecer todo',
      resetDone: 'Restablecido. El idioma ha vuelto al inglés.',
      noListTitle: 'No hay ninguna lista de conversaciones anteriores',
      noListBody:
        'No es un olvido: no hay nada que listar. Las conversaciones nunca se escriben en su dispositivo y caducan en el servidor, así que aquí no hay ningún historial que nadie pueda consultar, tampoco SCASPA.',
    },

    support: {
      heading: 'Ayuda y soporte',
      lead: 'Cuando el asistente no puede responder, esto sí.',
      callTitle: 'Llamar a SCASPA',
      callBody:
        'La vía más rápida para cualquier asunto sobre un envío, una reserva o un pago concretos: justo lo que un asistente sin inicio de sesión no puede consultar.',
      ticketTitle: 'Dejar una nota para el mostrador',
      ticketBody:
        'Describa el problema y reciba un número de referencia para citarlo. No se pide nombre ni correo electrónico, y nadie le contactará primero.',
      ticketAction: 'Contactar con soporte',
      privacyTitle: 'Qué se guarda y qué no',
      privacyBody: 'La nota de privacidad completa, en lenguaje claro.',
      privacyAction: 'Leer la nota de privacidad',
      tipsTitle: 'Cómo obtener una mejor respuesta',
      tip1: 'Nombre el lugar. El puerto de carga, el muelle de cruceros, la terminal de ferry y el aeropuerto son cuatro operaciones distintas, y nombrar una encuentra mucho más que decir «el puerto».',
      tip2: 'Pregunte una cosa a la vez. Dos preguntas en un mismo mensaje suelen acabar con una bien respondida y la otra de pasada.',
      tip3: 'Revise la fuente debajo de cada respuesta. Cada afirmación enlaza con el registro de SCASPA del que salió y con la fecha en que se verificó.',
    },

    about: {
      heading: 'Acerca de este asistente',
      lead: 'Qué es y qué no va a hacer.',
      whatTitle: 'Qué es',
      whatBody:
        'Un asistente de la St. Christopher Air & Sea Ports Authority, que cubre Deep Water Harbour, Port Zante, Basseterre Ferry Terminal y Robert L. Bradshaw International Airport.',
      rulesTitle: 'Las reglas que sigue',
      rule1: 'Responde únicamente a partir de información verificada de SCASPA.',
      rule2: 'Cada afirmación cita el registro del que procede.',
      rule3:
        'Nunca inventa un horario, una tarifa ni una norma. Cuando no lo sabe, lo dice y le remite a alguien que sí lo sabe.',
      rule4: 'No tiene inicio de sesión ni cuenta, y nunca sabe quién pregunta.',
      orgTitle: 'Acerca de SCASPA',
      orgBody: 'La organización, sus cuatro instalaciones y cómo contactar con cada una.',
      orgAction: 'Acerca de SCASPA',
    },
  },

  nav: {
    groups: {
      askPilot: 'Consultar a Pilot',
      operations: 'Operaciones',
      help: 'Ayuda',
      tools: 'Herramientas',
    },
    items: {
      chat: 'Chat',
      vessels: 'Buques',
      flights: 'Vuelos',
      tariffs: 'Tarifas',
      cargo: 'Carga',
      contactScaspa: 'Contactar con SCASPA',
      console: 'Consola',
    },
  },

  shell: {
    skipToConversation: 'Saltar a la conversación',
    openNavigation: 'Abrir la navegación',
    closeNavigation: 'Cerrar la navegación',
    navigation: 'Navegación',
    sections: 'Secciones',
    showSources: 'Ver las fuentes',
    sources: 'Fuentes',
    telephoneAuthority: 'Llamar a la Autoridad',
    aboutScaspa: 'Acerca de SCASPA',
    accessibility: 'Accesibilidad',
    homeLink: 'SCASPA — St. Christopher Air and Sea Ports Authority, inicio',
    search: 'Buscar',
    searchLabel: 'Buscar en la navegación y en las preguntas de esta sesión',
    recordedQuestions: 'Preguntas registradas',
    demonstrationProfile: 'Perfil de demostración',
    /* Dice que la aplicación está funcionando, no que el servidor responda. */
    online: 'Conectado',
  },

  sources: {
    lead: 'Cada dato indica de dónde procede y la fecha en que se verificó.',
    emptyTitle: 'Todavía no hay nada que mostrar',
    emptyBody:
      'Las citas aparecen aquí cuando llega una respuesta. Cada una enlaza con la página de SCASPA de la que procede.',
    snapshotNote:
      'La información es una instantánea, no un flujo en directo. La fecha que aparece aquí es la última vez que se comprobó ese dato, no una confirmación de que siga vigente hoy.',
  },

  errors: {
    notFoundTitle: 'Página no encontrada',
    notFoundBody:
      'No hemos encontrado esa página. Compruebe la dirección o vuelva atrás y pregunte al asistente.',
    backToAssistant: 'Volver al asistente',
    routeErrorTitle: 'Algo ha fallado en esta página',
    routeErrorBody:
      'La culpa es nuestra, no suya. Iniciar una conversación nueva suele resolverlo.',
    startNewConversation: 'Iniciar una conversación nueva',
    reloadPage: 'Recargar la página',
    reachDirectly: 'O contacte directamente con SCASPA',
  },
};
