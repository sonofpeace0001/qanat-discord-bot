// ═══════════════════════════════════════════════════════════════
// QANAT Bot -- Deep Knowledge Base
// Everything the bot knows about QANAT, organized by topic
// ═══════════════════════════════════════════════════════════════

const QANAT_IDENTITY = `QANAT is building digital infrastructure where people own their identity, their data, and their digital presence. The main project is WEB X. OS, a decentralized operating system that starts as software on your computer and is designed to evolve into a full OS comparable to Windows or Linux, but built around privacy, identity control, and permission-based access from the ground up. The core file system is called .qnt, where all data is encrypted and users control exactly who can access their information, how much is visible, and when access can be revoked. Identity verification uses zero-knowledge technology so people can prove who they are without exposing sensitive documents. The long-term vision is a world where digital sovereignty is normal, not exceptional.`;

const TOPICS = [
  // ── QANAT Overview ─────────────────────────────────────
  {
    id: 'qanat_overview',
    triggers: [
      /what is qanat/i, /about qanat/i, /tell me about/i, /explain qanat/i,
      /what does qanat do/i, /what'?s? qanat/i, /qanat meaning/i,
    ],
    responses: [
      `QANAT is building infrastructure for digital sovereignty. The idea is simple: your data, your identity, your rules. Right now the internet runs on a model where your information gets collected, stored, and monetized by companies you never agreed to give it to. QANAT is creating WEB X. OS, a decentralized operating system that changes that from the ground up.`,
      `Think of it this way. You lock your front door every day, but your personal data online has no lock at all. QANAT is building the lock. WEB X. OS is a decentralized operating system where you control your identity and data, not platforms, not corporations. You.`,
      `QANAT is a technology company focused on giving people real ownership over their digital lives. The flagship product is WEB X. OS, a decentralized OS built around privacy and user control. It uses a custom encrypted file system called .qnt and zero-knowledge identity verification. It's not another app sitting on top of broken systems. It's new infrastructure.`,
    ],
  },

  // ── The Problem ────────────────────────────────────────
  {
    id: 'the_problem',
    triggers: [
      /what problem/i, /why (does )?qanat/i, /what'?s? wrong/i, /purpose/i,
      /why (do )?we need/i, /data (is |being )?stolen/i, /privacy (issue|problem)/i,
      /centralized/i, /big tech/i, /data exploit/i,
    ],
    responses: [
      `Every click, every preference, every conversation you have online contributes to a profile that gets used, analyzed, and monetized without your real participation. You can lock your physical home, but your digital identity has no lock. That's the problem. QANAT exists because that imbalance is too significant to ignore.`,
      `The internet was built for access, speed, and scale, not for sovereignty. People study online, work online, build their lives on platforms that were never designed to give them real ownership. Once you share information, you rarely get to truly take it back. Your data gets duplicated across systems you have no visibility into. QANAT is building the alternative.`,
      `Right now, identity verification means exposing sensitive documents. Data is collected constantly and stored in centralized systems users don't control. People exist as participants in the digital world but not owners. QANAT is working to change that relationship fundamentally.`,
    ],
  },

  // ── WEB X. OS ──────────────────────────────────────────
  {
    id: 'webxos',
    triggers: [
      /web ?x/i, /webx/i, /operating system/i, /decentralized os/i,
      /the (?:main )?product/i, /what (?:are you|is qanat) build/i,
      /software/i, /platform/i,
    ],
    responses: [
      `WEB X. OS starts as software installed on your computer and is designed to evolve into a full operating system, comparable in importance to Windows or Linux. The difference is the architecture. Where traditional systems prioritize performance and compatibility, WEB X. OS prioritizes privacy, identity control, and permission-based access. The user is the central authority, not the platform.`,
      `WEB X. OS is QANAT's main infrastructure project. It's not another app that sits on top of existing broken systems. It's a completely new environment built from the ground up around the idea that you should control your own data and identity. It includes the .qnt encrypted file system, zero-knowledge identity verification, and eventually browser-level protection.`,
      `Think of WEB X. OS as what an operating system looks like when you design it around the user instead of around advertisers. Every layer is built with privacy and ownership in mind. It starts as desktop software and the vision is for it to become a complete OS ecosystem.`,
    ],
  },

  // ── .qnt File System ───────────────────────────────────
  {
    id: 'qnt_filesystem',
    triggers: [
      /\.qnt/i, /qnt file/i, /file system/i, /encrypted/i,
      /data encrypt/i, /permission/i, /access control/i, /revoke/i,
    ],
    responses: [
      `The .qnt file system is one of the core components. It's designed so you control exactly who can access your information, how much detail they can see, and when that access can be withdrawn. Everything is encrypted across all layers. Access is granted through keys that you provide when necessary, and you can revoke permissions at any time. It transforms data from something that gets extracted into something you intentionally manage.`,
      `With .qnt, your data isn't something that gets taken from you. It's something you actively control. You decide who sees what, how much they see, and you can pull access whenever you want. The encryption runs through every layer of the system. It's a fundamentally different relationship with your own information.`,
    ],
  },

  // ── Zero-Knowledge Identity ────────────────────────────
  {
    id: 'zk_identity',
    triggers: [
      /zero.knowledge/i, /zk/i, /identity verif/i, /prove.*without/i,
      /kyc/i, /verification/i, /identity solution/i, /without reveal/i,
    ],
    responses: [
      `The identity system uses zero-knowledge technology. That means you can confirm who you are or prove you meet certain requirements without actually revealing sensitive personal details. Verification happens through code, not through handing over documents. You prove eligibility without exposing your records. Trust is established by the system itself, not by surrendering your information.`,
      `Traditional identity verification means exposing your documents every time. QANAT's approach is different. Zero-knowledge technology lets you prove things about yourself, that you're over 18, that you live in a certain country, that you have a specific credential, without revealing the underlying data. It completely changes how trust works online.`,
    ],
  },

  // ── Data Ownership ─────────────────────────────────────
  {
    id: 'data_ownership',
    triggers: [
      /data own/i, /own.*data/i, /my data/i, /data belong/i,
      /data.*value/i, /digital economy/i, /data monetiz/i,
    ],
    responses: [
      `QANAT introduces the idea that data belongs to the person who creates it. You decide how your information is shared and whether that access carries value. Organizations can manage content according to their own models, but they have to respect your permissions. Instead of data being taken and traded without your involvement, it becomes something you actively manage.`,
      `Right now, your data gets extracted and traded without your involvement. QANAT flips that. Your data is yours. You choose who gets access, under what conditions, and you can revoke it. It's the foundation of a more balanced digital economy where participation replaces extraction.`,
    ],
  },

  // ── Future Development / Browser Protection ────────────
  {
    id: 'future_development',
    triggers: [
      /browser/i, /tracking/i, /future/i, /roadmap/i, /what'?s? next/i,
      /development/i, /upcoming/i, /plans/i,
    ],
    responses: [
      `The direction extends beyond identity and files. Future development includes browser-level protection that prevents websites from collecting personal data without consent. The idea is that you can navigate the internet without constant tracking. Privacy becomes part of the environment rather than an optional feature you have to hunt for.`,
      `Beyond WEB X. OS, the plan includes browser-level protections, expanded identity tools, and a fully integrated digital space where identity, data, and activity remain under your control. Beta testing is planned for Q1 2026, mainnet for Q3 2026. Still early.`,
    ],
  },

  // ── Real World Impact ──────────────────────────────────
  {
    id: 'real_world_impact',
    triggers: [
      /real world/i, /use case/i, /healthcare/i, /creator/i, /business/i,
      /practical/i, /how does it help/i, /what can it do/i, /benefit/i,
      /why should i care/i,
    ],
    responses: [
      `The impact reaches across industries. Healthcare data only accessed by those given permission. Creators retaining control over their audience data. Businesses managing information responsibly while building trust. Identity verification without repeatedly sharing personal records. It's a shift from depending on centralized systems to participating in a controlled environment.`,
      `Think about it practically. Right now, every time you verify your identity online, you expose sensitive documents. Every app you use collects data you can't take back. QANAT changes that for individuals, for healthcare, for creators who want to own their audience relationship, for businesses that want to handle data responsibly.`,
    ],
  },

  // ── Community & Why It Matters ─────────────────────────
  {
    id: 'community',
    triggers: [
      /community/i, /why.*join/i, /why.*here/i, /what'?s? this.*server/i,
      /early/i, /participate/i, /get involved/i, /why should i stay/i,
    ],
    responses: [
      `Technology alone doesn't create adoption. People do. The early community here helps shape direction, challenges assumptions, and tests ideas. Those who engage early play a direct role in how things evolve. This isn't just another Discord server. It's a group of people who are positioning themselves at the ground level of something that could change how the internet works.`,
      `Being here early matters. The people in this community right now aren't just observers, they're helping shape what QANAT becomes. Consistency builds recognition. Those who contribute thoughtfully tend to become educators, leaders, and early advocates. And yes, there are real benefits to that, both in role progression and future opportunities.`,
      `This community is where the direction gets shaped. Every question, every piece of feedback, every discussion contributes to how QANAT develops. Participation doesn't require technical expertise. Understanding the mission and helping others understand it is just as valuable.`,
    ],
  },

  // ── Role Structure ─────────────────────────────────────
  {
    id: 'roles',
    triggers: [
      /role/i, /how.*earn/i, /how.*get.*role/i, /what roles/i, /role.*journey/i,
      /verified/i, /early member/i, /active role/i, /beta.*role/i,
      /role.*pathway/i, /unlock/i,
    ],
    responses: [
      `The role journey goes: Verified, Early Members, Active, Contributor, Beta.\n\n` +
      `**Verified** is granted after completing verification.\n` +
      `**Early Members** is for those who joined early and believed in the vision from the beginning.\n` +
      `**Active** is for members who participate consistently, stay active for 7+ days, join discussions, ask or answer questions, and invite thoughtful members.\n` +
      `**Contributor** is for people who genuinely help grow, educate, and shape QANAT. It's not about task completion, it's about meaningful contribution.\n` +
      `**Beta** is for trusted members who earn it through consistent quality contribution and positive behavior. They get guaranteed beta access and direct communication with the team.`,

      `Roles here reflect real involvement, not just activity. The path is Verified, then Early Members or Active, then Contributor, then Beta. Each level comes with more access and more opportunity. The Contributor role is the big one. It replaced the old Creator and Builder roles, and it's about genuinely helping grow and shape QANAT.`,
    ],
  },

  // ── Contributor Role (detailed) ────────────────────────
  {
    id: 'contributor',
    triggers: [
      /contributor/i, /how.*contribut/i, /what.*contributor/i,
      /creator.*role/i, /builder.*role/i, /contribute/i,
    ],
    responses: [
      `The Contributor role is for members who genuinely help grow, educate, and shape QANAT. Here's how you earn it:\n\n` +
      `Share thoughtful insights about QANAT or WEB X. OS\n` +
      `Help others understand the mission\n` +
      `Create educational or discussion-driven content\n` +
      `Contribute ideas, feedback, or improvements\n` +
      `Show consistency and positive behavior\n` +
      `Invite thoughtful members\n\n` +
      `This isn't about completing tasks. It's about meaningful, genuine contribution. The benefits are real: recognition as a core community builder, priority in campaigns and initiatives, eligibility for moderator and ambassador pathways, creator spotlight, access to contributor-only discussions, higher consideration for beta participation, and the opportunity to shape direction.`,

      `Contributor is the role that matters most right now. It replaced Creator and Builder because those were too task-based. Contributor is about genuinely caring about what QANAT is building and showing that through your actions. Help people understand the vision, share insights, create content, give feedback. The people who hold this role are positioning themselves for real opportunities as the project grows.`,
    ],
  },

  // ── Beta Role ──────────────────────────────────────────
  {
    id: 'beta',
    triggers: [
      /beta.*test/i, /beta.*role/i, /beta.*access/i, /how.*beta/i,
      /test.*software/i, /mainnet/i,
    ],
    responses: [
      `Beta testers are members trusted to test QANAT technology. To get there, you need consistent quality contributions, the Contributor role, and positive community behavior. The benefits are significant: guaranteed beta access, early feature testing, direct communication with the team, and participation in key ecosystem opportunities. Beta testing is planned for Q1 2026, mainnet for Q3 2026.`,
    ],
  },

  // ── Timeline / Launch ──────────────────────────────────
  {
    id: 'timeline',
    triggers: [
      /when.*launch/i, /when.*live/i, /when.*release/i, /timeline/i,
      /when.*ready/i, /when.*mainnet/i, /when.*beta/i, /still early/i,
    ],
    responses: [
      `Beta testing is planned for Q1 2026, mainnet for Q3 2026. The software is nearly ready to be rolled out. If you're here now, you're early, and that matters.`,
      `The beta is coming Q1 2026 and mainnet follows in Q3 2026. Still early. The people who are here now and contributing are the ones who'll be most positioned when things launch.`,
    ],
  },

  // ── Token ──────────────────────────────────────────────
  {
    id: 'token',
    triggers: [
      /token/i, /coin/i, /crypto/i, /price/i, /moon/i, /lambo/i,
      /when.*list/i, /tokenomics/i, /airdrop/i, /pump/i,
    ],
    responses: [
      `Token details haven't been announced yet. The team is focused on shipping the product first. When there's news, it'll come through official channels.`,
      `Nothing on the token front yet. QANAT is product-first. When there's something to announce, you'll hear about it here before anywhere else.`,
      `No token info yet. The focus right now is building WEB X. OS and getting to beta. That's where the real value is being created.`,
    ],
  },

  // ── Getting Started ────────────────────────────────────
  {
    id: 'getting_started',
    triggers: [
      /get started/i, /new here/i, /just joined/i, /what.*do.*first/i,
      /how.*start/i, /i'?m new/i, /beginning/i,
    ],
    responses: [
      `Welcome. Start by getting verified, then introduce yourself so people know who you are. From there, the best thing you can do is learn about what QANAT is building. Read through the channels, ask questions, join discussions. Participation here isn't just about being active. It's about understanding the mission and contributing to it. That's how you move up from Verified to Active to Contributor.`,
      `Good to have you. Get verified first, then drop an intro about yourself. After that, start learning about QANAT and WEB X. OS. Ask questions, share your thoughts, engage in discussions. The members who do that consistently are the ones who earn the Contributor role and get positioned for real opportunities as things develop.`,
    ],
  },

  // ── Digital Sovereignty ────────────────────────────────
  {
    id: 'sovereignty',
    triggers: [
      /sovereign/i, /freedom/i, /control.*data/i, /own.*identity/i,
      /decentraliz/i, /web3/i, /blockchain/i, /defi/i, /dao/i,
    ],
    responses: [
      `Digital sovereignty means you are the authority over your own digital life. Not a platform, not a corporation, not a government. You. QANAT is building the infrastructure to make that practical, not theoretical. WEB X. OS, the .qnt file system, zero-knowledge identity, these aren't features. They're the foundation of a different kind of internet.`,
      `A lot of projects talk about decentralization, but QANAT is focused on something more specific: sovereignty. It's not just about removing middlemen. It's about making sure the individual is always the one in control of their identity, their data, and their digital presence. That's a bigger idea than most people realize.`,
    ],
  },

  // ── Team / Who's Behind It ─────────────────────────────
  {
    id: 'team',
    triggers: [
      /who.*behind/i, /team/i, /founder/i, /ceo/i, /who.*build/i,
      /who.*run/i, /developers/i,
    ],
    responses: [
      `QANAT is built by QANAT Technology. If you have questions about the project or the product specifically, you can tag <@377033754083983361> and they'll get back to you.`,
      `For specific product or project questions, <@377033754083983361> is the person to reach out to. The team is actively building and engaged with the community here.`,
    ],
  },

  // ── How to Help / Contribute ───────────────────────────
  {
    id: 'how_to_help',
    triggers: [
      /how.*help/i, /what can i do/i, /how.*useful/i, /want to help/i,
      /how.*contribute/i, /ways to/i,
    ],
    responses: [
      `You don't need technical expertise. Learn about digital identity and privacy, engage in discussions, share insights, help others understand the mission. Create content if that's your thing. Give feedback. Invite thoughtful people. Consistency matters more than anything. The people who show up and contribute genuinely are the ones who become core community builders.`,
      `Best ways to contribute: understand what QANAT is actually building and talk about it thoughtfully. Help new members get oriented. Share your perspective in discussions. Create content that educates people about digital sovereignty. Give honest feedback. Be consistent. That's what earns the Contributor role and positions you for future opportunities.`,
    ],
  },

  // ── Whitepaper / Learn More ────────────────────────────
  {
    id: 'whitepaper',
    triggers: [
      /whitepaper/i, /white paper/i, /learn more/i, /read more/i,
      /documentation/i, /more info/i, /where.*read/i,
    ],
    responses: [
      `The whitepaper is at qanat.io. It breaks down the full vision, the technology, and the approach. Worth reading if you want to understand what's actually being built here.`,
      `Head to qanat.io for the whitepaper and introductory information. It covers WEB X. OS, the .qnt file system, zero-knowledge identity, all of it. Good starting point if you want the full picture.`,
    ],
  },

  // ── Greetings ──────────────────────────────────────────
  {
    id: 'greeting',
    triggers: [
      /^(hey|hi|hello|yo|sup|what'?s? ?up|howdy|hola|wassup)\b/i,
    ],
    responses: [
      `Hey NAME, how's it going?`,
      `Yo NAME, good to see you.`,
      `Hey! What's good, NAME?`,
      `What's up NAME`,
      `Hey NAME`,
    ],
  },

  // ── Thanks ─────────────────────────────────────────────
  {
    id: 'thanks',
    triggers: [
      /\b(thanks|thank you|thx|ty|appreciate it)\b/i,
    ],
    responses: [
      `Anytime.`,
      `No problem, NAME.`,
      `Happy to help.`,
      `Of course.`,
      `You're welcome.`,
    ],
  },

  // ── How are you ────────────────────────────────────────
  {
    id: 'how_are_you',
    triggers: [
      /how are you/i, /how'?s? it going/i, /how you doing/i,
    ],
    responses: [
      `Doing good, NAME. Keeping things running. How about you?`,
      `All good here. What's going on with you, NAME?`,
      `Can't complain. What are you up to?`,
    ],
  },

  // ── Bot identity ───────────────────────────────────────
  {
    id: 'bot_identity',
    triggers: [
      /are you a bot/i, /you a bot/i, /who are you/i, /what are you/i,
      /what can you do/i, /what do you do/i,
    ],
    responses: [
      `I'm QANAT's community bot. I know the project inside out, I keep things organized, track engagement, and I'm always around if you have questions. Try /help to see the commands.`,
      `I'm the community bot here. I handle questions about QANAT, track engagement points and invites, moderate when needed, and generally try to keep things moving. If you're curious about something, just ask.`,
    ],
  },

  // ── Excitement / Hype ──────────────────────────────────
  {
    id: 'excitement',
    triggers: [
      /\b(lfg|let'?s go|bullish|hyped|excited|love this|fire|amazing|we'?re? early)\b/i,
    ],
    responses: [
      `The energy is real, NAME.`,
      `That's what I like to hear.`,
      `NAME gets it.`,
      `This energy right here. This is what builds things.`,
      `Early and aware. Good place to be.`,
    ],
  },

  // ── Confusion / Need Help ──────────────────────────────
  {
    id: 'confusion',
    triggers: [
      /i'?m confused/i, /don'?t understand/i, /lost/i, /can someone help/i,
      /i need help/i, /help me/i, /explain/i,
    ],
    responses: [
      `No worries, NAME. What specifically are you trying to figure out? I can help with most things about QANAT.`,
      `All good, NAME. Tell me what's got you stuck and I'll see what I can do.`,
      `What are you confused about? Break it down and I'll try to make it clearer.`,
    ],
  },

  // ── Bye / Leaving ──────────────────────────────────────
  {
    id: 'farewell',
    triggers: [
      /\b(bye|goodbye|see ya|gotta go|heading out|peace out|later|cya)\b/i,
    ],
    responses: [
      `Later, NAME.`,
      `Catch you around, NAME.`,
      `See you, NAME. Stay solid.`,
      `Peace, NAME.`,
    ],
  },

  // ── Building / Working on stuff ────────────────────────
  {
    id: 'building',
    triggers: [
      /\b(building|i'?m working|developing|coding|creating|designing)\b/i,
    ],
    responses: [
      `Respect. The builders are the ones who move this thing forward. What are you working on?`,
      `Good to hear, NAME. What are you building?`,
      `That's what this community is about. Drop some details, curious what you're up to.`,
    ],
  },

  // ── Compliments ────────────────────────────────────────
  {
    id: 'compliments',
    triggers: [
      /great community/i, /love this community/i, /cool project/i,
      /nice server/i, /good vibes/i, /great server/i,
    ],
    responses: [
      `Appreciate that, NAME. It's the people here that make it what it is.`,
      `Thanks NAME. The community is what gives this project its strength.`,
      `Good to hear that, NAME. Stick around, it's only getting better.`,
    ],
  },

  // ── Competitor / Comparison ────────────────────────────
  {
    id: 'competitors',
    triggers: [
      /competitor/i, /compared to/i, /vs\b/i, /better than/i,
      /what makes.*different/i, /why not just/i, /similar project/i,
    ],
    responses: [
      `QANAT isn't trying to be another app on top of existing systems. It's building entirely new infrastructure. WEB X. OS is a decentralized operating system, not a plugin or a feature. That's a fundamentally different approach from most projects in this space.`,
      `The difference is in the approach. Most projects add privacy features on top of existing systems. QANAT is building the system itself from scratch with sovereignty as the foundation. WEB X. OS, the .qnt file system, zero-knowledge identity, it's infrastructure, not an add-on.`,
    ],
  },
];

// ── Response used tracking (avoid repeats) ───────────────────
const usedResponses = new Map(); // topicId -> Set of recently used indices

function getTopicResponse(topicId, responses, name) {
  if (!usedResponses.has(topicId)) {
    usedResponses.set(topicId, new Set());
  }

  const used = usedResponses.get(topicId);

  // Reset if all used
  if (used.size >= responses.length) {
    used.clear();
  }

  // Find unused response
  let idx;
  do {
    idx = Math.floor(Math.random() * responses.length);
  } while (used.has(idx) && used.size < responses.length);

  used.add(idx);

  let response = responses[idx];
  if (name) {
    response = response.replace(/NAME/g, name);
  }
  return response;
}

// ── Topic Matcher ────────────────────────────────────────────
// Scores a message against all topics and returns the best match

function findTopic(text) {
  let bestTopic = null;
  let bestScore = 0;

  for (const topic of TOPICS) {
    let score = 0;
    for (const trigger of topic.triggers) {
      if (trigger.test(text)) {
        // Longer regex patterns get higher scores
        score += 2;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  return bestScore >= 2 ? bestTopic : null;
}

// ── Smart Reply Generator ────────────────────────────────────
// Finds the right topic and generates a varied response

function thinkAndReply(messageText, authorName) {
  const topic = findTopic(messageText);
  if (!topic) return null;

  return {
    topicId: topic.id,
    response: getTopicResponse(topic.id, topic.responses, authorName),
  };
}

// ── Check if message is about QANAT topics ───────────────────
// Used to decide whether to jump into conversations

function isQANATRelated(text) {
  const qanatKeywords = [
    /qanat/i, /web ?x/i, /\.qnt/i, /sovereignty/i, /decentraliz/i,
    /data.*own/i, /zero.knowledge/i, /privacy.*control/i, /digital.*identity/i,
    /mainnet/i, /beta.*test/i, /whitepaper/i,
  ];
  return qanatKeywords.some(kw => kw.test(text));
}

// ── Check if message is a question ───────────────────────────

function isQuestion(text) {
  const lower = text.toLowerCase().trim();
  if (lower.includes('?')) return true;
  if (/^(what|how|where|when|why|who|can|does|is|will|should|could|would|do)\b/i.test(lower)) return true;
  return false;
}

module.exports = {
  QANAT_IDENTITY,
  TOPICS,
  findTopic,
  thinkAndReply,
  isQANATRelated,
  isQuestion,
  getTopicResponse,
};
