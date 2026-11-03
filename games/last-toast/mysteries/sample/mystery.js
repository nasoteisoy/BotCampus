/**
 * Sample mystery — "The Last Toast at Rookwood Inn"
 * Tone: light humor. Player is Riley Quinn, insurance investigator.
 * Content-only file: skills, checks, branches, and flavor live here.
 */
window.MYSTERY = {
  id: "rookwood-inn",
  title: "The Last Toast at Rookwood Inn",
  tone: "comedic",
  premise:
    "During a stormy reunion dinner, wine merchant Julian Crowe collapses after a private toast. Someone poisoned his glass. You are on the policy — interview the guests, roll some checks, and accuse the killer before dawn.",
  victim: {
    name: "Julian Crowe",
    description:
      "Successful wine merchant and host of tonight's reunion. Found slumped over the dining table with a half-empty glass of port that smells suspiciously like a chemistry final."
  },
  storageKey: "mystery-template:rookwood-inn:v2",
  startSceneId: "foyer",

  lore: {
    setting:
      "Rookwood Inn — a creaky coastal guest house famous for loud storms, louder guests, and a cellar that has 'seen things.' The year is vaguely now; the dress code is 'funeral-adjacent cocktail.'",
    history:
      "Julian Crowe called this reunion to settle old accounts: family, partners, rivals. The innkeeper's nephew serves the wine. Nobody planned on a corpse — or so they claim.",
    intro:
      "Riley, the call came at midnight: Crowe Mutual's most expensive client just face-planted into dessert. You're the investigator they send when the paperwork might get awkward. The constable wants a neat report by dawn. Your coat is damp, your patience is thinner, and five guests are already practicing their alibis. Time to be Riley Quinn."
  },

  player: {
    name: "Riley Quinn",
    role: "Freelance insurance investigator (Crowe Mutual contractor)",
    backstory:
      "You once worked claims for Crowe Mutual until Julian Crowe himself recommended you for 'discreet' fieldwork. You know a forged signature from a bad pen. You do not know how to leave a buffet alone.",
    personality:
      "Dry, lightly sarcastic, allergic to melodrama, weirdly fond of inns with terrible wallpaper.",
    voice:
      "Second person, wry asides allowed. Address the player as Riley. Humor is situational, never mean about the victim.",
    skills: {
      Investigation: 4,
      Persuasion: 2,
      Insight: 3,
      "Sleight of Hand": 1,
      Athletics: 0
    }
  },

  motives: [
    { id: "debt", label: "Crushing debt — silence a creditor" },
    { id: "inheritance", label: "Inheritance — claim the cellar empire" },
    { id: "malpractice", label: "Cover up past malpractice" },
    { id: "theft", label: "Hide ongoing theft from the cellar" },
    { id: "rivalry", label: "Business rivalry — reclaim a lost contract" }
  ],

  suspects: [
    {
      id: "clara",
      name: "Clara Crowe",
      role: "Estranged sister",
      alibi: "Says she was in the guest lounge writing a letter when the toast was poured.",
      secret: "Recently forged Julian's signature on a warehouse lease to keep her boutique open.",
      relationships: [
        { to: "julian", note: "Sibling rivalry; draft will drama." },
        { to: "marcus", note: "Thinks he exploits Julian." }
      ],
      motive: "inheritance"
    },
    {
      id: "marcus",
      name: "Marcus Vane",
      role: "Business partner",
      alibi: "Claims he stepped into the garden for 'air' before the toast.",
      secret: "Owes Julian forty thousand; due tonight or else.",
      relationships: [
        { to: "julian", note: "Partner on paper; debtor in private." },
        { to: "helen", note: "Asked her about sedatives 'for nerves'." },
        { to: "theo", note: "Paid Theo to ignore a cellar visit earlier." }
      ],
      motive: "debt"
    },
    {
      id: "helen",
      name: "Dr. Helen Park",
      role: "Guest physician",
      alibi: "Says she was upstairs checking her medical kit after dinner.",
      secret: "Julian knew about a covered-up dosing error from her clinic years ago.",
      relationships: [
        { to: "julian", note: "Old acquaintance; uneasy." },
        { to: "marcus", note: "Warned him not to touch her vials." }
      ],
      motive: "malpractice"
    },
    {
      id: "theo",
      name: "Theo Lang",
      role: "Waiter (innkeeper's nephew)",
      alibi: "Was clearing plates in the kitchen when the toast happened.",
      secret: "Skimming rare bottles; Julian caught him last week.",
      relationships: [
        { to: "julian", note: "Threatened to tell the innkeeper." },
        { to: "iris", note: "Sold her two stolen bottles." },
        { to: "marcus", note: "Took hush money to look away from the cellar stairs." }
      ],
      motive: "theft"
    },
    {
      id: "iris",
      name: "Iris Quill",
      role: "Rival merchant",
      alibi: "Was on the porch smoking, watching the rain like a noir poster.",
      secret: "Forged a competitor complaint hoping to stall Julian's new label.",
      relationships: [
        { to: "julian", note: "Lost the Harbor Club exclusive." },
        { to: "theo", note: "Buys 'discreet' stock." }
      ],
      motive: "rivalry"
    }
  ],

  evidence: [
    {
      id: "poisoned-glass",
      name: "Poisoned port glass",
      description:
        "Julian's glass smells of bitter almonds. Residue on the rim — the shared bottle is innocent, which is rude of it."
    },
    {
      id: "debt-ledger",
      name: "Debt ledger page",
      description:
        "Torn page: Marcus Vane owes Julian 40,000, due 'tonight or else.' The handwriting has the energy of a threat letter wearing a necktie."
    },
    {
      id: "empty-vial",
      name: "Empty cyanide vial",
      description:
        "Small medical vial, empty, wrapped in a monogrammed napkin that matches Marcus's cuff. Subtle. Not subtle."
    },
    {
      id: "garden-mud",
      name: "Garden mud prints",
      description:
        "Mud from the garden door toward the dining room — stopping short of Julian's chair, like someone rehearsing 'I was outside.'"
    },
    {
      id: "helen-kit",
      name: "Helen's unlocked kit",
      description:
        "Medical kit left unlocked upstairs. One foam cutout empty; shape matches the vial downstairs."
    },
    {
      id: "theo-corkscrew",
      name: "Theo's marked corkscrew",
      description:
        "Theo's corkscrew scratch matches a sideboard cork — he opened a bottle, just not Julian's doomed port."
    },
    {
      id: "will-draft",
      name: "Draft will note",
      description:
        "Julian's half-written note: Clara gets nothing until 'the forgery is sorted.' Undated. Dramatic."
    },
    {
      id: "marcus-ask",
      name: "Sedative inquiry",
      description:
        "Helen recalls Marcus asking which vial could 'put a man under quickly.' She refused. Then her kit went missing a friend."
    },
    {
      id: "cellar-bribe",
      name: "Cellar hush note",
      description:
        "A damp note in the cellar stairwell: 'Keep quiet about the kit stairs — M.V.' Theo's pocket lint is all over it. Branch evidence."
    }
  ],

  scenes: [
    {
      id: "foyer",
      title: "Rookwood Inn — Foyer",
      text:
        "Rain hammers the inn like it has a personal grudge. Constable Rowe nods at you — Riley Quinn, the one with the clipboard and the dry look. Julian Crowe is dead in the private dining room. Five guests remain. Gather evidence, press stories, roll when it matters, then accuse before dawn.",
      choices: [
        { label: "Enter the dining room", go: "dining" },
        { label: "Check the guest lounge", go: "lounge" },
        { label: "Visit the kitchen", go: "kitchen" },
        {
          label: "Slip down the cellar stairs (branch — need Theo's tip)",
          go: "cellar",
          requireFlags: { theoSpill: true }
        }
      ]
    },
    {
      id: "dining",
      title: "Private Dining Room",
      text:
        "Julian still sits at the head of the table, which is extremely on-brand for a host who hated leaving early. One glass of port stands apart. The shared bottle looks fine. A monogrammed napkin sulks near the sideboard. Riley, this is your crime scene — try not to get crumbs on it.",
      choices: [
        {
          label: "Examine Julian's glass",
          examine: "poisoned-glass",
          giveEvidence: "poisoned-glass",
          setFlags: { examinedGlass: true }
        },
        {
          label: "Sleight of Hand: palm-inspect the napkin (DC 11)",
          requireFlags: { examinedGlass: true },
          check: {
            id: "napkin-sleight",
            skill: "Sleight of Hand",
            dc: 11,
            retry: false,
            success: {
              text:
                "You angle the napkin like a magician who bills insurance companies. Empty cyanide vial, Marcus's monogram — jackpot with a side of awkward.",
              giveEvidence: "empty-vial",
              setFlags: { foundVial: true, vialViaSleight: true }
            },
            fail: {
              text:
                "You fumble the napkin. It flutters. Everyone imaginary judges you. The vial rolls — still yours to claim the clumsy way.",
              setFlags: { napkinFumble: true }
            },
            critFail: {
              text:
                "Nat 1. You trip, faceplant into the carpet, and invent a new stain. The napkin sticks to your forehead. Dignity: gone. Vial: still on the floor — you scoop it up while coughing.",
              giveEvidence: "empty-vial",
              setFlags: { foundVial: true, vialViaSleight: false, napkinCritFail: true }
            },
            critSuccess: {
              text:
                "Nat 20. You clock the monogram, the empty vial, and a cuff-thread match without even looking smug. Okay, a little smug.",
              giveEvidence: "empty-vial",
              setFlags: { foundVial: true, vialViaSleight: true, vialCrit: true }
            }
          }
        },
        {
          label: "Just pick up the napkin (no roll — always works)",
          requireFlags: { examinedGlass: true },
          examine: "empty-vial",
          giveEvidence: "empty-vial",
          setFlags: { foundVial: true, vialViaPickup: true }
        },
        {
          label: "Follow the mud trail",
          examine: "garden-mud",
          giveEvidence: "garden-mud",
          setFlags: { sawMud: true }
        },
        {
          label: "Investigation: search the sideboard papers (DC 12)",
          requireEvidence: ["poisoned-glass"],
          check: {
            id: "sideboard-invest",
            skill: "Investigation",
            dc: 12,
            retry: false,
            success: {
              text:
                "Under a wine list and a flyer for 'Live Jazz (Cancelled),' you find Marcus's debt ledger page. Tonight or else. Charming.",
              giveEvidence: "debt-ledger",
              setFlags: { sawLedger: true, ledgerViaSearch: true }
            },
            fail: {
              text:
                "You shuffle papers and mostly learn that Rookwood overcharges for nuts. The debt page stays hidden — try another angle later.",
              setFlags: { missedSideboard: true }
            },
            critFail: {
              text:
                "Nat 1. You sneeze-paper-avalanche the sideboard. A coaster hits your shin. No ledger — only shame and a coupon for soup.",
              setFlags: { missedSideboard: true, sideboardChaos: true }
            },
            critSuccess: {
              text:
                "Nat 20. Ledger page, a margin note ('pay or talk'), and you somehow refold the wine list better than you found it.",
              giveEvidence: "debt-ledger",
              setFlags: { sawLedger: true, ledgerViaSearch: true, ledgerCrit: true }
            }
          }
        },
        {
          label: "Return to the foyer",
          go: "foyer"
        },
        {
          label: "Go to the lounge",
          go: "lounge"
        },
        {
          label: "Ready to accuse",
          accuse: true,
          requireEvidence: ["poisoned-glass", "empty-vial", "debt-ledger", "helen-kit", "marcus-ask"],
          requireFlags: { pressedMarcus: true }
        }
      ]
    },
    {
      id: "lounge",
      title: "Guest Lounge",
      text:
        "Five guests under low lamps. Thunder does its community-theater best. Riley, pick a conversation — or climb upstairs / duck back out.",
      choices: [
        { label: "Talk to Clara Crowe", talk: "clara", go: "talk-clara" },
        { label: "Talk to Marcus Vane", talk: "marcus", go: "talk-marcus" },
        { label: "Talk to Dr. Helen Park", talk: "helen", go: "talk-helen" },
        { label: "Talk to Theo Lang", talk: "theo", go: "talk-theo" },
        { label: "Talk to Iris Quill", talk: "iris", go: "talk-iris" },
        { label: "Climb to the upstairs hall", go: "upstairs" },
        { label: "Back to the foyer", go: "foyer" }
      ]
    },
    {
      id: "kitchen",
      title: "Kitchen",
      text:
        "Steam, soap, and the smell of heroic dishwashing. Theo's station is a cork graveyard. Riley, if you wanted a quiet place to think, this is not it — but it is useful.",
      choices: [
        {
          label: "Examine Theo's corkscrew",
          examine: "theo-corkscrew",
          giveEvidence: "theo-corkscrew",
          setFlags: { sawCorkscrew: true }
        },
        {
          label: "Search the scrap drawer",
          examine: "will-draft",
          giveEvidence: "will-draft",
          requireFlags: { talkedClara: true }
        },
        {
          /* Alternate route to debt-ledger if sideboard Investigation failed */
          label: "Insight: read the staff chalkboard gossip (DC 10)",
          requireFlags: { missedSideboard: true },
          check: {
            id: "chalk-insight",
            skill: "Insight",
            dc: 10,
            retry: false,
            success: {
              text:
                "Between 'buy butter' and 'Theo!!!,' someone chalked 'Vane 40k tonight.' You copy it onto a torn page. Alternate route: debt evidence secured.",
              giveEvidence: "debt-ledger",
              setFlags: { sawLedger: true, ledgerViaChalk: true }
            },
            fail: {
              text:
                "The chalkboard is mostly doodles of ducks. You learn nothing about money and everything about the artist's ducks.",
              setFlags: { chalkFail: true }
            },
            critFail: {
              text:
                "Nat 1. You lean on the board; it tilts; chalk dust ghosts your coat. You look like a flour ghost. Still no ledger.",
              setFlags: { chalkFail: true }
            }
          }
        },
        {
          /* Second alternate if chalk also failed: Iris tip path uses flag from Iris */
          label: "Check the tip jar liner (Iris tip)",
          requireFlags: { irisDebtTip: true },
          requireEvidence: [],
          examine: "debt-ledger",
          giveEvidence: "debt-ledger",
          setFlags: { sawLedger: true, ledgerViaIris: true }
        },
        { label: "Return to the foyer", go: "foyer" },
        { label: "Go to the dining room", go: "dining" }
      ]
    },
    {
      id: "upstairs",
      title: "Upstairs Hall",
      text:
        "Narrow hall, louder rain. Helen's medical kit sits open on a console like an invitation written in foam cutouts.",
      choices: [
        {
          label: "Inspect Helen's medical kit",
          examine: "helen-kit",
          giveEvidence: "helen-kit",
          setFlags: { sawKit: true }
        },
        { label: "Return to the lounge", go: "lounge" },
        { label: "Back to the foyer", go: "foyer" }
      ]
    },
    {
      id: "cellar",
      title: "Cellar Stairwell",
      text:
        "This path only opened because Theo cracked under pressure. The stairwell smells like oak and bad decisions. A damp note waits under the railing — hush money with initials.",
      choices: [
        {
          label: "Take the hush note",
          examine: "cellar-bribe",
          giveEvidence: "cellar-bribe",
          setFlags: { gotCellarBribe: true }
        },
        {
          label: "Climb back to the foyer",
          go: "foyer"
        }
      ]
    },
    {
      id: "talk-clara",
      title: "Talk: Clara Crowe",
      text:
        "Clara keeps her gloves on like the air owes her money. \"I was writing in the lounge. Julian and I barely spoke. If you think I wanted his cellar, look at who owed him.\" Riley, she is very practiced at sounding unbothered.",
      choices: [
        {
          label: "Ask about the will",
          setFlags: { talkedClara: true },
          go: "talk-clara-will"
        },
        { label: "Leave her for now", go: "lounge" }
      ]
    },
    {
      id: "talk-clara-will",
      title: "Clara — on the will",
      text:
        "She stiffens. \"He threatened to cut me out over a warehouse lease. I didn't kill him for ink.\" Noted. The kitchen scrap drawer might agree.",
      choices: [{ label: "Return to the lounge", go: "lounge" }]
    },
    {
      id: "talk-marcus",
      title: "Talk: Marcus Vane",
      text:
        "Marcus smells like wet wool and rehearsed calm. \"Garden air. Cleared my head. I didn't pour that toast — ask Helen about the glasses.\" Riley, his smile is a little too polished for midnight murder.",
      choices: [
        {
          label: "Confront him about the debt (need ledger)",
          requireEvidence: ["debt-ledger"],
          setFlags: { pressedMarcus: true },
          go: "talk-marcus-debt"
        },
        {
          label: "Ask why mud prints stop short (need mud)",
          requireEvidence: ["garden-mud"],
          go: "talk-marcus-mud"
        },
        { label: "Leave him for now", go: "lounge" }
      ]
    },
    {
      id: "talk-marcus-debt",
      title: "Marcus — pressed on the debt",
      text:
        "His smile cracks. \"Yes, I owed him. He wanted blood tonight. That doesn't mean I—\" He pockets a hand near his cuff. \"We're done.\" Riley, you have pressed the bruise that matters.",
      choices: [{ label: "Return to the lounge", go: "lounge" }]
    },
    {
      id: "talk-marcus-mud",
      title: "Marcus — on the mud",
      text:
        "\"I went outside, yes. Came back through the dining room. I never reached his chair. Believe that or don't.\"",
      choices: [{ label: "Return to the lounge", go: "lounge" }]
    },
    {
      id: "talk-helen",
      title: "Talk: Dr. Helen Park",
      text:
        "Helen looks exhausted in a professional way. \"I was upstairs with my kit. Almond on the breath — cyanide, if I'm blunt. I keep a lab sample locked. Or I did.\"",
      choices: [
        {
          label: "Ask who inquired about her vials (need kit evidence)",
          requireEvidence: ["helen-kit"],
          giveEvidence: "marcus-ask",
          setFlags: { gotMarcusAsk: true },
          go: "talk-helen-vials"
        },
        {
          label: "Ask about Julian's hold on her",
          setFlags: { heardHelenSecret: true },
          go: "talk-helen-secret"
        },
        { label: "Leave her for now", go: "lounge" }
      ]
    },
    {
      id: "talk-helen-vials",
      title: "Helen — on the vials",
      text:
        "\"Marcus asked which vial could put a man under quickly. I refused. Then my kit was unlocked and a cyanide sample gone. The napkin downstairs isn't mine.\"",
      choices: [{ label: "Return to the lounge", go: "lounge" }]
    },
    {
      id: "talk-helen-secret",
      title: "Helen — on Julian",
      text:
        "Quietly: \"He knew about an old clinic mistake. Favors, not cash. I hated that. I did not open that vial tonight.\"",
      choices: [{ label: "Return to the lounge", go: "lounge" }]
    },
    {
      id: "talk-theo",
      title: "Talk: Theo Lang",
      text:
        "Theo wrings a towel like it confessed. \"Kitchen the whole time. I open bottles, I don't poison them. Julian was going to tell my uncle I borrowed stock.\" Riley, he is one good push from spilling something useful.",
      choices: [
        {
          label: "Ask about the scratched corkscrew (need evidence)",
          requireEvidence: ["theo-corkscrew"],
          go: "talk-theo-cork"
        },
        {
          /* Branch gate: success unlocks cellar scene via theoSpill */
          label: "Persuasion: press Theo about hush money (DC 13)",
          check: {
            id: "theo-persuade",
            skill: "Persuasion",
            dc: 13,
            retry: false,
            success: {
              text:
                "Theo wilts. \"Fine. Marcus paid me to ignore the cellar stairs by the kit hall. There's a note. I didn't read it. I absolutely read it.\" Branch unlocked: cellar stairs.",
              setFlags: { theoSpill: true },
              go: "talk-theo-spill"
            },
            fail: {
              text:
                "Theo clams up and invents a sudden need to polish forks. No cellar tip — you'll solve this the long way.",
              setFlags: { theoClam: true }
            },
            critFail: {
              text:
                "Nat 1. You lean on a tray; forks applause onto the floor. Theo laughs, then freezes. No confession — only cutlery chaos.",
              setFlags: { theoClam: true, theoCritFail: true }
            },
            critSuccess: {
              text:
                "Nat 20. Theo spills the bribe, the initials, and where the note hides. He also offers you free soup. You decline. Branch unlocked.",
              setFlags: { theoSpill: true, theoCritSuccess: true },
              go: "talk-theo-spill"
            }
          }
        },
        { label: "Leave him for now", go: "lounge" }
      ]
    },
    {
      id: "talk-theo-cork",
      title: "Theo — on the corkscrew",
      text:
        "\"That scratch is from last week. Bordeaux for Iris, not Julian's port. Check the corks.\"",
      choices: [{ label: "Return to the lounge", go: "lounge" }]
    },
    {
      id: "talk-theo-spill",
      title: "Theo — the bribe",
      text:
        "He points toward the foyer. \"Cellar stairs off the entry. Note under the rail. If Uncle asks, I was polishing ethics.\" Riley, that path did not exist until this conversation.",
      choices: [
        { label: "Head to the foyer (cellar now available)", go: "foyer" },
        { label: "Return to the lounge", go: "lounge" }
      ]
    },
    {
      id: "talk-iris",
      title: "Talk: Iris Quill",
      text:
        "Iris taps ash into a saucer. \"Porch. Rain. I wanted his Harbor Club shelf, not a corpse. Theo sells odd bottles; I buy. That's my crime.\"",
      choices: [
        {
          /* Alternate debt route helper if sideboard + chalk failed */
          label: "Insight: notice her slip about Marcus (DC 12)",
          requireFlags: { missedSideboard: true },
          check: {
            id: "iris-insight",
            skill: "Insight",
            dc: 12,
            retry: false,
            success: {
              text:
                "She mutters that Marcus was bragging about 'forty thousand problems.' She saw him stuff a page in the kitchen tip jar. Alternate breadcrumb unlocked.",
              setFlags: { irisDebtTip: true }
            },
            fail: {
              text:
                "Iris blows smoke at your theory. You get vibe, not facts.",
              setFlags: { irisInsightFail: true }
            }
          }
        },
        { label: "Leave her for now", go: "lounge" }
      ]
    }
  ],

  solution: {
    suspectId: "marcus",
    motiveId: "debt",
    requiredEvidence: ["poisoned-glass", "debt-ledger", "empty-vial", "helen-kit", "marcus-ask"],
    explainWin:
      "Marcus Vane poisoned Julian's port. Facing a due-tonight debt, he stole the cyanide sample from Helen's unlocked kit after she refused to help, wiped the vial on his monogrammed napkin, and staged a garden walk so mud would muddy the trail. The shared bottle was clean — only Julian's glass was lethal. Riley closes the file before the coffee gets cold.",
    explainLose:
      "The true killer was Marcus Vane (debt). He stole Helen's cyanide vial and poisoned only Julian's glass, leaving his monogrammed napkin by the empty vial. Garden mud and Theo's theft were red herrings; Helen's past gave her motive but not the means tonight. Riley, the report will need a rewrite."
  }
};
