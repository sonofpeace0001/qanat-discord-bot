// ═══════════════════════════════════════════════════════════════
// QANAT Bot — FAQ Data & Smart Matcher
// ═══════════════════════════════════════════════════════════════

const FAQ_DATA = [
  {
    keywords: ['what is qanat', 'about qanat', 'qanat meaning', 'tell me about qanat'],
    question: 'What is QANAT?',
    answer: '**QANAT** is the brand of QANAT Technology and offers **Digital Sovereignty by Design!** — Unbreakable. Unstoppable. Unchained.\n\n🌐 Visit [qanat.io](https://qanat.io) to learn more.',
  },
  {
    keywords: ['problem', 'solving', 'what problem', 'why qanat', 'purpose'],
    question: 'What problem is QANAT solving?',
    answer: 'QANAT solves the problem of **digital identity and data protection** in an increasingly vulnerable online world. While you can lock your physical home, your personal data is silently stolen and exploited by large centralized entities in the digital realm.\n\nQANAT empowers users to regain control by creating a **secure, user-centric platform** that treats digital identity and data with the same respect and protection as your physical home.',
  },
  {
    keywords: ['goal', 'qanat goal', 'objective'],
    question: "What is QANAT's Goal?",
    answer: 'With **Web X. OS**, QANAT is establishing the decentralized operating system for secure, transparent, and self-determined digital interactions that gives people back control over their data.',
  },
  {
    keywords: ['mission', 'qanat mission'],
    question: "What is QANAT's Mission?",
    answer: 'We empower people to take **complete control** of their digital identities and data, creating a fair digital ecosystem where they own their most valuable assets.',
  },
  {
    keywords: ['vision', 'qanat vision'],
    question: "What is QANAT's Vision?",
    answer: 'A digital world in which **data sovereignty is the norm** and every individual can shape their digital identity freely, securely, and autonomously.',
  },
  {
    keywords: ['web x', 'webx', 'web x os', 'decentralized os', 'operating system', 'webxos'],
    question: 'What is WEB X. OS?',
    answer: '**WEB X. OS** is a Decentralized Operating System and QANAT\'s main infrastructure project. It is a revolutionary decentralized platform that gives people back complete control over their digital identities and personal data.',
  },
  {
    keywords: ['live', 'software live', 'launched', 'ready', 'mainnet', 'beta', 'release date', 'when launch'],
    question: "Is QANAT's software live?",
    answer: 'The software is almost ready to be rolled out! 🚀\n\n• **Beta Testing:** Q1 2026\n• **Mainnet Release:** Q3 2026\n\nYou are still early! 🎯',
  },
  {
    keywords: ['token', 'coin', 'crypto', 'qanat token', 'tokenomics'],
    question: 'Will there be a QANAT Token?',
    answer: 'Information will follow soon. Stay tuned! 👀',
  },
  {
    keywords: ['get started', 'how to start', 'begin', 'new here', 'join', 'getting started'],
    question: 'How do I get started with QANAT?',
    answer: 'Welcome to QANAT! Here\'s how to get started:\n\n1️⃣ Visit [qanat.io](https://www.qanat.io/) for introductory info, blog & Whitepaper\n2️⃣ Follow us on [X/Twitter](https://x.com/QANAT_IO)\n3️⃣ Engage with the community & QANAT team right here on Discord!',
  },
  {
    keywords: ['help', 'issue', 'problem', 'stuck', 'where help', 'get help'],
    question: 'Where can I get help?',
    answer: 'Post your question in <#1351659316498792529> with details about your issue. Include error messages and screenshots if possible! 🛠️',
  },
  {
    keywords: ['bug', 'report bug', 'error', 'broken', 'not working'],
    question: 'How do I report a bug?',
    answer: 'Post in <#1351659316498792529> with:\n• Steps to reproduce\n• Expected vs actual behavior\n• Your environment details\n\nThe team will look into it! 🐛',
  },
  {
    keywords: ['share project', 'show project', 'my project', 'built something', 'creation'],
    question: 'Can I share my QANAT project here?',
    answer: 'Yes! Use <#1450149595161039053> to share what you\'ve built. We love seeing community creations! 🎨',
  },
  {
    keywords: ['suggest', 'feature request', 'new feature', 'idea', 'suggestion'],
    question: 'How do I suggest new features?',
    answer: 'Share your ideas in <#1450149845418377397>. We review all suggestions regularly! 💡',
  },
  {
    keywords: ['promote', 'promotion', 'advertise', 'self promo', 'sell', 'services'],
    question: 'Can I promote my services or products?',
    answer: '❌ **No**, self-promotion requires explicit staff permission. Please ask a staff member first before promoting anything.',
  },
  {
    keywords: ['report', 'violation', 'rule break', 'report user', 'abuse'],
    question: 'How do I report rule violations?',
    answer: 'DM any staff member or use Discord\'s built-in report function. We take community safety seriously! 🛡️',
  },
];

// ── Matching Engine ──────────────────────────────────────────

/**
 * Find the best FAQ match for a user message.
 * Returns { question, answer, score } or null if no match.
 */
function matchFAQ(message) {
  const normalized = message.toLowerCase().replace(/[^\w\s]/g, '').trim();
  if (normalized.length < 3) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const faq of FAQ_DATA) {
    let score = 0;

    for (const keyword of faq.keywords) {
      const kwParts = keyword.toLowerCase().split(/\s+/);
      const allPresent = kwParts.every(part => normalized.includes(part));

      if (allPresent) {
        // Longer keyword matches = higher score
        score += kwParts.length * 2;
      } else {
        // Partial match — count how many parts match
        const partialCount = kwParts.filter(p => normalized.includes(p)).length;
        score += partialCount * 0.5;
      }
    }

    if (score > bestScore && score >= 2) {
      bestScore = score;
      bestMatch = { question: faq.question, answer: faq.answer, score };
    }
  }

  return bestMatch;
}

/**
 * Get all FAQ entries for display.
 */
function getAllFAQ() {
  return FAQ_DATA.map((faq, i) => ({
    index: i + 1,
    question: faq.question,
    answer: faq.answer,
  }));
}

module.exports = { matchFAQ, getAllFAQ, FAQ_DATA };
