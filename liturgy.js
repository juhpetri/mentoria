// Roteiro da Missa (Rito Romano, ordinário) com palavras-chave em português
// para detectar a parte em andamento a partir da fala captada do padre,
// mais a resposta esperada da assembleia e uma explicação em inglês do
// porquê dessa resposta existir (catequese rápida para quem não é católico
// ou não fala português).
const LITURGY = [
  {
    // Sung/spoken before the Sign of the Cross at this parish. Repeated 1-2x.
    // Not part of the official Missal Romano text — it's a local entrance
    // practice, but it's fixed wording, so it's pre-scripted like the rest.
    id: "invocacao-inicial",
    keywords: [
      "invocamos o seu nome",
      "invocamos o seu poder",
      "invocamos a tua presença no meio de nós",
    ],
    titlePt: "Invocação Inicial",
    titleEn: "Opening Invocation",
    responsePt: "Invocamos o seu nome, invocamos o seu poder, invocamos a tua presença no meio de nós.",
    responseEn: "We call on your name, we call on your power, we call on your presence among us.",
    explanationEn:
      "Before the Sign of the Cross, the assembly calls on God to be present — a local opening practice, repeated once or twice to settle the community into prayer.",
  },
  {
    id: "sinal-cruz",
    keywords: ["em nome do pai", "do filho e do espírito santo"],
    titlePt: "Sinal da Cruz",
    titleEn: "Sign of the Cross",
    responsePt: "Amém.",
    responseEn: "Amen.",
    explanationEn:
      "The priest opens Mass invoking the Holy Trinity. 'Amen' means 'so be it' — the assembly confirms and joins the prayer.",
  },
  {
    // This parish's missal uses the greeting formula whose response is
    // "Bendito seja Deus, que nos reuniu no amor de Cristo" (one of the
    // Roman Missal's alternative greeting forms), repeated 0-2x — not the
    // more common "Ele está no meio de nós" form.
    id: "saudacao",
    keywords: [
      "o deus da esperança",
      "que nos cumula de toda alegria",
      "bendito seja deus, que nos reuniu no amor de cristo",
    ],
    titlePt: "Saudação Inicial",
    titleEn: "Greeting",
    responsePt: "Bendito seja Deus, que nos reuniu no amor de Cristo.",
    responseEn: "Blessed be God, who has gathered us together in the love of Christ.",
    explanationEn:
      "A greeting exchanged at the start of Mass. This parish's response form praises God for bringing the community together in Christ's love, rather than the more common 'And with your spirit.'",
  },
  {
    id: "ato-penitencial",
    keywords: ["preparemos-nos", "reconheçamos", "confesso a deus", "senhor, tende piedade"],
    titlePt: "Ato Penitencial",
    titleEn: "Penitential Act",
    responsePt: "Senhor, tende piedade de nós. Cristo, tende piedade de nós.",
    responseEn: "Lord, have mercy. Christ, have mercy.",
    explanationEn:
      "Before listening to God's word, the assembly admits its faults and asks for mercy, preparing the heart to celebrate.",
  },
  {
    id: "gloria",
    keywords: ["gloria a deus nas alturas", "glória a deus"],
    titlePt: "Glória",
    titleEn: "Gloria",
    responsePt: "Glória a Deus nas alturas, e paz na terra aos homens por Ele amados...",
    responseEn: "Glory to God in the highest, and on earth peace to people of good will...",
    explanationEn:
      "An ancient hymn of praise (sung by angels at Christ's birth, Luke 2:14), sung on Sundays and feasts as joyful praise.",
  },
  {
    id: "oracao-coleta",
    keywords: ["oremos"],
    titlePt: "Oração (Coleta)",
    titleEn: "Collect / Opening Prayer",
    responsePt: "Amém.",
    responseEn: "Amen.",
    explanationEn:
      "The priest 'collects' the silent intentions of everyone present into one prayer. 'Amen' means the assembly makes that prayer its own.",
  },
  {
    id: "leitura",
    keywords: ["leitura", "palavra do senhor"],
    titlePt: "Leitura",
    titleEn: "Reading",
    responsePt: "Graças a Deus.",
    responseEn: "Thanks be to God.",
    explanationEn:
      "After a reading from Scripture (not the Gospel), the assembly thanks God for his word.",
  },
  {
    id: "evangelho",
    keywords: ["evangelho de nosso senhor jesus cristo", "palavra da salvação"],
    titlePt: "Evangelho",
    titleEn: "Gospel",
    responsePt: "Glória a vós, Senhor. / Louvor a vós, ó Cristo.",
    responseEn: "Glory to you, O Lord. / Praise to you, Lord Jesus Christ.",
    explanationEn:
      "The Gospel is Christ's own words, so it receives special honor: standing, and acclaiming Christ before and after it is read.",
  },
  {
    id: "credo",
    keywords: ["creio em deus pai", "professemos a nossa fé"],
    titlePt: "Credo",
    titleEn: "Creed",
    responsePt: "Creio em Deus Pai todo-poderoso...",
    responseEn: "I believe in God, the Father almighty...",
    explanationEn:
      "On Sundays and solemnities the assembly publicly states, together, what it believes — a profession of the Christian faith.",
  },
  {
    id: "oracao-fieis",
    keywords: ["oremos, irmãos", "oração universal", "peçamos ao senhor"],
    titlePt: "Oração dos Fiéis",
    titleEn: "Prayer of the Faithful",
    responsePt: "Senhor, escutai a nossa oração. (ou variável)",
    responseEn: "Lord, hear our prayer. (or as announced)",
    explanationEn:
      "The community prays for the Church, the world, the suffering, and the local community, exercising the priesthood of the baptized.",
  },
  {
    id: "apresentacao-dons",
    keywords: ["bendito sejais, senhor", "deste pão", "deste vinho"],
    titlePt: "Apresentação dos Dons",
    titleEn: "Presentation of the Gifts",
    responsePt: "Bendito seja Deus para sempre.",
    responseEn: "Blessed be God for ever.",
    explanationEn:
      "Bread and wine — fruit of human work — are brought to the altar to be offered and later become the Eucharist.",
  },
  {
    id: "orai-irmaos",
    keywords: ["orai, irmãos", "para que o meu e o vosso sacrifício"],
    titlePt: "Orai, irmãos",
    titleEn: "Pray, brethren",
    responsePt: "Receba o Senhor por tuas mãos este sacrifício...",
    responseEn: "May the Lord accept the sacrifice at your hands...",
    explanationEn:
      "An invitation for the whole assembly, not just the priest, to recognize this offering as belonging to everyone present.",
  },
  {
    id: "prefacio",
    keywords: ["o senhor esteja convosco", "corações ao alto", "demos graças ao senhor"],
    titlePt: "Diálogo do Prefácio",
    titleEn: "Preface Dialogue",
    responsePt: "Eis o nosso coração. / É justo e necessário.",
    responseEn: "We lift them up to the Lord. / It is right and just.",
    explanationEn:
      "Opens the Eucharistic Prayer, the most sacred part of Mass — the priest invites everyone to lift their hearts to thank God.",
  },
  {
    id: "santo",
    keywords: ["santo, santo, santo", "senhor deus do universo"],
    titlePt: "Santo",
    titleEn: "Holy, Holy, Holy (Sanctus)",
    responsePt: "Santo, Santo, Santo é o Senhor, Deus do Universo...",
    responseEn: "Holy, Holy, Holy Lord God of hosts...",
    explanationEn:
      "Taken from Isaiah 6:3 — the assembly joins the angels' own song of praise to God, right before the consecration.",
  },
  {
    id: "consagracao",
    keywords: ["isto é o meu corpo", "isto é o meu sangue", "mistério da fé"],
    titlePt: "Consagração",
    titleEn: "Consecration",
    responsePt: "Anunciamos, Senhor, a vossa morte, proclamamos a vossa ressurreição...",
    responseEn: "We proclaim your Death, O Lord, and profess your Resurrection...",
    explanationEn:
      "Catholics believe the bread and wine become the Body and Blood of Christ at this moment — the heart of the Mass.",
  },
  {
    id: "pai-nosso",
    keywords: ["pai nosso que estais nos céus", "ensinados pelo salvador"],
    titlePt: "Pai Nosso",
    titleEn: "Lord's Prayer",
    responsePt: "Pai Nosso, que estais nos céus...",
    responseEn: "Our Father, who art in heaven...",
    explanationEn:
      "The prayer Jesus himself taught (Matthew 6:9-13), prayed together before receiving Communion as children of one Father.",
  },
  {
    id: "saudacao-paz",
    keywords: ["a paz do senhor", "dai-vos mutuamente a paz"],
    titlePt: "Saudação da Paz",
    titleEn: "Sign of Peace",
    responsePt: "Amém. (e trocam um gesto de paz entre si)",
    responseEn: "Amen. (and exchange a sign of peace with one another)",
    explanationEn:
      "Before sharing the one Bread, Christians reconcile with one another, living out the peace Christ gives.",
  },
  {
    id: "cordeiro-de-deus",
    keywords: ["cordeiro de deus", "que tirais o pecado do mundo"],
    titlePt: "Cordeiro de Deus",
    titleEn: "Lamb of God (Agnus Dei)",
    responsePt: "Tende piedade de nós. / Dai-nos a paz.",
    responseEn: "Have mercy on us. / Grant us peace.",
    explanationEn:
      "Jesus is called 'Lamb of God' (John 1:29) — sung while the Bread is broken, just before Communion.",
  },
  {
    id: "comunhao",
    keywords: ["felizes os convidados", "eis o cordeiro de deus", "corpo de cristo"],
    titlePt: "Comunhão",
    titleEn: "Communion",
    responsePt: "Senhor, eu não sou digno... / Amém.",
    responseEn: "Lord, I am not worthy... / Amen.",
    explanationEn:
      "Catholics who are baptized, in full communion with the Church and free of serious sin receive the Eucharist; 'Amen' affirms belief that this is truly the Body of Christ.",
  },
  {
    id: "bencao-final",
    keywords: ["o senhor esteja com vós", "abençoe-vos deus todo-poderoso", "ide em paz"],
    titlePt: "Bênção Final e Despedida",
    titleEn: "Final Blessing and Dismissal",
    responsePt: "Amém. / Graças a Deus.",
    responseEn: "Amen. / Thanks be to God.",
    explanationEn:
      "The priest sends the assembly out to live what was celebrated — 'Mass' comes from 'missio' (mission): go and put faith into action.",
  },
];

if (typeof module !== "undefined") {
  module.exports = LITURGY;
}
