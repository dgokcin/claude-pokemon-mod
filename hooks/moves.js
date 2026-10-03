// Movesets for /pokemon attack: each mon maps to the moves it can use and the animation effect each one plays.

export const MOVES = {
  abra: [{ name: 'Teleport', effect: 'teleport' }, { name: 'Confusion', effect: 'rings', color: 0xd88aff }],
  aerodactyl: [
    { name: 'Wing Attack', effect: 'wind' }, { name: 'Bite', effect: 'impact' },
    { name: 'Hyper Beam', effect: 'beam', color: 0xffe9a6 }, { name: 'Supersonic', effect: 'rings', color: 0x9ad0ff }
  ],
  alakazam: [
    { name: 'Psychic', effect: 'rings', color: 0xff6ad5 }, { name: 'Kinesis', effect: 'rings', color: 0xffb0f0 },
    { name: 'Recover', effect: 'heal' }, { name: 'Reflect', effect: 'shield' }
  ],
  arbok: [
    { name: 'Wrap', effect: 'vines' }, { name: 'Poison Sting', effect: 'sludge' }, { name: 'Bite', effect: 'impact' },
    { name: 'Acid', effect: 'sludge' }
  ],
  arcanine: [
    { name: 'Flamethrower', effect: 'flame' }, { name: 'Take Down', effect: 'tackle' },
    { name: 'Bite', effect: 'impact' }, { name: 'Agility', effect: 'teleport' }
  ],
  articuno: [
    { name: 'Ice Beam', effect: 'beam', color: 0x9ae6ff }, { name: 'Blizzard', effect: 'ice' },
    { name: 'Agility', effect: 'teleport' }, { name: 'Mist', effect: 'ice' }
  ],
  beedrill: [
    { name: 'Twineedle', effect: 'sludge' }, { name: 'Fury Attack', effect: 'impact' },
    { name: 'Agility', effect: 'teleport' }
  ],
  bellsprout: [
    { name: 'Vine Whip', effect: 'vines' }, { name: 'Sleep Powder', effect: 'powder', color: 0x8fd0ff },
    { name: 'Acid', effect: 'sludge' }
  ],
  blastoise: [
    { name: 'Hydro Pump', effect: 'spray' }, { name: 'Bite', effect: 'impact' }, { name: 'Withdraw', effect: 'shield' },
    { name: 'Skull Bash', effect: 'tackle' }
  ],
  bulbasaur: [
    { name: 'Vine Whip', effect: 'vines', from: 'top' }, { name: 'Razor Leaf', effect: 'leaves' },
    { name: 'Leech Seed', effect: 'drain' }, { name: 'Sleep Powder', effect: 'powder', color: 0x8fd0ff, from: 'top' }
  ],
  butterfree: [
    { name: 'Confusion', effect: 'rings', color: 0xd88aff },
    { name: 'Sleep Powder', effect: 'powder', color: 0x8fd0ff },
    { name: 'Stun Spore', effect: 'powder', color: 0xf2d22e }, { name: 'Gust', effect: 'wind' }
  ],
  caterpie: [{ name: 'String Shot', effect: 'string' }, { name: 'Tackle', effect: 'tackle' }],
  chansey: [
    { name: 'Soft-Boiled', effect: 'heal' }, { name: 'Sing', effect: 'notes' },
    { name: 'Double Slap', effect: 'impact' }, { name: 'Minimize', effect: 'shield' }
  ],
  charizard: [
    { name: 'Flamethrower', effect: 'flame' }, { name: 'Slash', effect: 'slash' },
    { name: 'Wing Attack', effect: 'wind' }, { name: 'Seismic Toss', effect: 'impact' }
  ],
  charmander: [
    { name: 'Ember', effect: 'flame' }, { name: 'Scratch', effect: 'slash' }, { name: 'Growl', effect: 'notes' },
    { name: 'Smokescreen', effect: 'powder', color: 0x5a5a5a }
  ],
  charmeleon: [
    { name: 'Flamethrower', effect: 'flame' }, { name: 'Slash', effect: 'slash' }, { name: 'Rage', effect: 'tackle' },
    { name: 'Smokescreen', effect: 'powder', color: 0x5a5a5a }
  ],
  clefable: [
    { name: 'Sing', effect: 'notes' }, { name: 'Double Slap', effect: 'impact' }, { name: 'Minimize', effect: 'shield' }
  ],
  clefairy: [
    { name: 'Sing', effect: 'notes' }, { name: 'Pound', effect: 'impact' }, { name: 'Minimize', effect: 'shield' }
  ],
  cloyster: [
    { name: 'Clamp', effect: 'bubbles' }, { name: 'Spike Cannon', effect: 'impact' },
    { name: 'Aurora Beam', effect: 'beam', color: 0xa0ffd8 }, { name: 'Withdraw', effect: 'shield' }
  ],
  cubone: [
    { name: 'Bone Club', effect: 'quake' }, { name: 'Headbutt', effect: 'tackle' }, { name: 'Growl', effect: 'notes' }
  ],
  dewgong: [
    { name: 'Aurora Beam', effect: 'beam', color: 0xa0ffd8 }, { name: 'Headbutt', effect: 'tackle' },
    { name: 'Rest', effect: 'sleep', text: 'It started sleeping!' }
  ],
  diglett: [
    { name: 'Dig', effect: 'teleport' }, { name: 'Scratch', effect: 'slash' }, { name: 'Earthquake', effect: 'quake' },
    { name: 'Sand Attack', effect: 'powder', color: 0xd8b878 }
  ],
  ditto: [{ name: 'Transform', effect: 'transform' }],
  dodrio: [
    { name: 'Drill Peck', effect: 'impact' }, { name: 'Tri Attack', effect: 'stars' },
    { name: 'Agility', effect: 'teleport' }
  ],
  doduo: [
    { name: 'Peck', effect: 'impact' }, { name: 'Agility', effect: 'teleport' }, { name: 'Growl', effect: 'notes' }
  ],
  dragonair: [
    { name: 'Dragon Rage', effect: 'dragon' }, { name: 'Wrap', effect: 'vines' },
    { name: 'Thunder Wave', effect: 'bolt' }, { name: 'Agility', effect: 'teleport' }
  ],
  dragonite: [
    { name: 'Hyper Beam', effect: 'beam', color: 0xffe9a6 }, { name: 'Outrage', effect: 'dragon' },
    { name: 'Wing Attack', effect: 'wind' }, { name: 'Thunder Punch', effect: 'impact', color: 0xffe14a }
  ],
  dratini: [
    { name: 'Wrap', effect: 'vines' }, { name: 'Thunder Wave', effect: 'bolt' },
    { name: 'Dragon Rage', effect: 'dragon' }
  ],
  drowzee: [
    { name: 'Hypnosis', effect: 'rings', color: 0xb07aff }, { name: 'Confusion', effect: 'rings', color: 0xd88aff },
    { name: 'Dream Eater', effect: 'shadow' }, { name: 'Headbutt', effect: 'tackle' }
  ],
  dugtrio: [
    { name: 'Dig', effect: 'teleport' }, { name: 'Slash', effect: 'slash' }, { name: 'Earthquake', effect: 'quake' },
    { name: 'Sand Attack', effect: 'powder', color: 0xd8b878 }
  ],
  eevee: [
    { name: 'Quick Attack', effect: 'tackle' }, { name: 'Sand Attack', effect: 'powder', color: 0xd8b878 },
    { name: 'Bite', effect: 'impact' }, { name: 'Growl', effect: 'notes' }
  ],
  ekans: [
    { name: 'Wrap', effect: 'vines' }, { name: 'Poison Sting', effect: 'sludge' }, { name: 'Bite', effect: 'impact' }
  ],
  electabuzz: [
    { name: 'Thunder Punch', effect: 'impact', color: 0xffe14a }, { name: 'Thunderbolt', effect: 'bolt' },
    { name: 'Light Screen', effect: 'shield' }, { name: 'Quick Attack', effect: 'tackle' }
  ],
  electrode: [
    { name: 'Explosion', effect: 'explode' }, { name: 'Screech', effect: 'rings', color: 0xe8e8e8 },
    { name: 'Swift', effect: 'stars' }, { name: 'Thunder Shock', effect: 'bolt' }
  ],
  exeggcute: [
    { name: 'Hypnosis', effect: 'rings', color: 0xb07aff }, { name: 'Leech Seed', effect: 'drain' },
    { name: 'Barrage', effect: 'impact' }
  ],
  exeggutor: [
    { name: 'Solar Beam', effect: 'beam', color: 0xfff27a }, { name: 'Stomp', effect: 'tackle' },
    { name: 'Hypnosis', effect: 'rings', color: 0xb07aff }, { name: 'Egg Bomb', effect: 'impact' }
  ],
  farfetchd: [
    { name: 'Cut', effect: 'slash' }, { name: 'Fury Attack', effect: 'impact' }, { name: 'Agility', effect: 'teleport' }
  ],
  fearow: [
    { name: 'Drill Peck', effect: 'impact' }, { name: 'Agility', effect: 'teleport' }, { name: 'Fly', effect: 'wind' }
  ],
  flareon: [
    { name: 'Flamethrower', effect: 'flame' }, { name: 'Quick Attack', effect: 'tackle' },
    { name: 'Bite', effect: 'impact' }, { name: 'Smog', effect: 'powder', color: 0x7a6a8a }
  ],
  gastly: [
    { name: 'Lick', effect: 'shadow' }, { name: 'Night Shade', effect: 'shadow' },
    { name: 'Hypnosis', effect: 'rings', color: 0xb07aff }, { name: 'Confuse Ray', effect: 'shadow', color: 0xffe066 }
  ],
  gengar: [
    { name: 'Night Shade', effect: 'shadow' }, { name: 'Hypnosis', effect: 'rings', color: 0xb07aff },
    { name: 'Lick', effect: 'shadow' }, { name: 'Dream Eater', effect: 'shadow' }
  ],
  geodude: [
    { name: 'Rock Throw', effect: 'rocks' }, { name: 'Tackle', effect: 'tackle' },
    { name: 'Defense Curl', effect: 'shield' }, { name: 'Self-Destruct', effect: 'explode' }
  ],
  gloom: [
    { name: 'Absorb', effect: 'drain' }, { name: 'Poison Powder', effect: 'powder', color: 0xb45ad8 },
    { name: 'Acid', effect: 'sludge' }, { name: 'Petal Dance', effect: 'leaves' }
  ],
  golbat: [
    { name: 'Leech Life', effect: 'drain' }, { name: 'Wing Attack', effect: 'wind' },
    { name: 'Supersonic', effect: 'rings', color: 0x9ad0ff }, { name: 'Bite', effect: 'impact' }
  ],
  goldeen: [
    { name: 'Horn Attack', effect: 'tackle' }, { name: 'Supersonic', effect: 'rings', color: 0x9ad0ff },
    { name: 'Waterfall', effect: 'spray' }
  ],
  golduck: [
    { name: 'Confusion', effect: 'rings', color: 0xd88aff }, { name: 'Hydro Pump', effect: 'spray' },
    { name: 'Fury Swipes', effect: 'slash' }, { name: 'Amnesia', effect: 'shield' }
  ],
  golem: [
    { name: 'Rock Slide', effect: 'rocks' }, { name: 'Earthquake', effect: 'quake' },
    { name: 'Explosion', effect: 'explode' }, { name: 'Defense Curl', effect: 'shield' }
  ],
  graveler: [
    { name: 'Rock Throw', effect: 'rocks' }, { name: 'Earthquake', effect: 'quake' },
    { name: 'Self-Destruct', effect: 'explode' }, { name: 'Defense Curl', effect: 'shield' }
  ],
  grimer: [
    { name: 'Pound', effect: 'impact' }, { name: 'Poison Gas', effect: 'powder', color: 0x9a6ac8 },
    { name: 'Sludge', effect: 'sludge', color: 0x9a5ac8 }, { name: 'Minimize', effect: 'shield' }
  ],
  growlithe: [
    { name: 'Ember', effect: 'flame' }, { name: 'Bite', effect: 'impact' }, { name: 'Roar', effect: 'notes' },
    { name: 'Take Down', effect: 'tackle' }
  ],
  gyarados: [
    { name: 'Hyper Beam', effect: 'beam', color: 0xffe9a6 }, { name: 'Dragon Rage', effect: 'dragon' },
    { name: 'Hydro Pump', effect: 'spray' }, { name: 'Bite', effect: 'impact' }
  ],
  haunter: [
    { name: 'Lick', effect: 'shadow' }, { name: 'Night Shade', effect: 'shadow' },
    { name: 'Hypnosis', effect: 'rings', color: 0xb07aff }, { name: 'Confuse Ray', effect: 'shadow', color: 0xffe066 }
  ],
  hitmonchan: [
    { name: 'Fire Punch', effect: 'impact', color: 0xff7a2e }, { name: 'Ice Punch', effect: 'impact', color: 0x9ae6ff },
    { name: 'Thunder Punch', effect: 'impact', color: 0xffe14a }, { name: 'Agility', effect: 'teleport' }
  ],
  hitmonlee: [
    { name: 'Hi Jump Kick', effect: 'impact' }, { name: 'Mega Kick', effect: 'impact' },
    { name: 'Meditate', effect: 'shield' }
  ],
  horsea: [
    { name: 'Bubble', effect: 'bubbles' }, { name: 'Smokescreen', effect: 'powder', color: 0x5a5a5a },
    { name: 'Water Gun', effect: 'spray' }
  ],
  hypno: [
    { name: 'Hypnosis', effect: 'rings', color: 0xb07aff }, { name: 'Psychic', effect: 'rings', color: 0xff6ad5 },
    { name: 'Dream Eater', effect: 'shadow' }, { name: 'Headbutt', effect: 'tackle' }
  ],
  ivysaur: [
    { name: 'Razor Leaf', effect: 'leaves' }, { name: 'Vine Whip', effect: 'vines', from: 'top' },
    { name: 'Poison Powder', effect: 'powder', color: 0xb45ad8, from: 'top' }, { name: 'Leech Seed', effect: 'drain' }
  ],
  jigglypuff: [
    { name: 'Sing', effect: 'notes' }, { name: 'Pound', effect: 'impact' },
    { name: 'Rest', effect: 'sleep', text: 'It started sleeping!' }, { name: 'Defense Curl', effect: 'shield' }
  ],
  jolteon: [
    { name: 'Thunderbolt', effect: 'bolt' }, { name: 'Pin Missile', effect: 'impact' },
    { name: 'Quick Attack', effect: 'tackle' }, { name: 'Agility', effect: 'teleport' }
  ],
  jynx: [
    { name: 'Lovely Kiss', effect: 'notes' }, { name: 'Ice Punch', effect: 'impact', color: 0x9ae6ff },
    { name: 'Blizzard', effect: 'ice' }, { name: 'Psychic', effect: 'rings', color: 0xff6ad5 }
  ],
  kabuto: [
    { name: 'Scratch', effect: 'slash' }, { name: 'Harden', effect: 'shield' }, { name: 'Absorb', effect: 'drain' }
  ],
  kabutops: [
    { name: 'Slash', effect: 'slash' }, { name: 'Hydro Pump', effect: 'spray' }, { name: 'Absorb', effect: 'drain' },
    { name: 'Harden', effect: 'shield' }
  ],
  kadabra: [
    { name: 'Teleport', effect: 'teleport' }, { name: 'Kinesis', effect: 'rings', color: 0xffb0f0 },
    { name: 'Psybeam', effect: 'beam', color: 0xff8ad8 }, { name: 'Recover', effect: 'heal' }
  ],
  kakuna: [{ name: 'Harden', effect: 'shield' }],
  kangaskhan: [
    { name: 'Comet Punch', effect: 'impact' }, { name: 'Rage', effect: 'tackle' }, { name: 'Bite', effect: 'impact' },
    { name: 'Earthquake', effect: 'quake' }
  ],
  kingler: [
    { name: 'Crabhammer', effect: 'impact' }, { name: 'Guillotine', effect: 'slash' },
    { name: 'Bubble', effect: 'bubbles' }, { name: 'Stomp', effect: 'tackle' }
  ],
  koffing: [
    { name: 'Tackle', effect: 'tackle' }, { name: 'Smog', effect: 'powder', color: 0x7a6a8a },
    { name: 'Sludge', effect: 'sludge', color: 0x9a5ac8 }, { name: 'Self-Destruct', effect: 'explode' }
  ],
  krabby: [
    { name: 'Bubble', effect: 'bubbles' }, { name: 'Vice Grip', effect: 'slash' }, { name: 'Harden', effect: 'shield' },
    { name: 'Crabhammer', effect: 'impact' }
  ],
  lapras: [
    { name: 'Surf', effect: 'spray' }, { name: 'Ice Beam', effect: 'beam', color: 0x9ae6ff },
    { name: 'Sing', effect: 'notes' }, { name: 'Body Slam', effect: 'tackle' }
  ],
  lickitung: [
    { name: 'Lick', effect: 'shadow' }, { name: 'Wrap', effect: 'vines' }, { name: 'Stomp', effect: 'tackle' },
    { name: 'Supersonic', effect: 'rings', color: 0x9ad0ff }
  ],
  machamp: [
    { name: 'Karate Chop', effect: 'slash' }, { name: 'Seismic Toss', effect: 'impact' },
    { name: 'Submission', effect: 'impact' }, { name: 'Earthquake', effect: 'quake' }
  ],
  machoke: [
    { name: 'Karate Chop', effect: 'slash' }, { name: 'Seismic Toss', effect: 'impact' },
    { name: 'Focus Energy', effect: 'shield' }
  ],
  machop: [
    { name: 'Karate Chop', effect: 'slash' }, { name: 'Low Kick', effect: 'impact' },
    { name: 'Seismic Toss', effect: 'impact' }
  ],
  magikarp: [{ name: 'Splash', effect: 'splash', text: 'But nothing happened!' }, { name: 'Tackle', effect: 'tackle' }],
  magmar: [
    { name: 'Fire Punch', effect: 'impact', color: 0xff7a2e }, { name: 'Flamethrower', effect: 'flame' },
    { name: 'Smog', effect: 'powder', color: 0x7a6a8a }, { name: 'Confuse Ray', effect: 'shadow', color: 0xffe066 }
  ],
  magnemite: [
    { name: 'Thunder Shock', effect: 'bolt' }, { name: 'Supersonic', effect: 'rings', color: 0x9ad0ff },
    { name: 'Swift', effect: 'stars' }
  ],
  magneton: [
    { name: 'Thunderbolt', effect: 'bolt' }, { name: 'Supersonic', effect: 'rings', color: 0x9ad0ff },
    { name: 'Swift', effect: 'stars' }
  ],
  mankey: [
    { name: 'Karate Chop', effect: 'slash' }, { name: 'Low Kick', effect: 'impact' },
    { name: 'Thrash', effect: 'tackle' }, { name: 'Screech', effect: 'rings', color: 0xe8e8e8 }
  ],
  marowak: [
    { name: 'Bonemerang', effect: 'quake' }, { name: 'Bone Club', effect: 'quake' },
    { name: 'Thrash', effect: 'tackle' }
  ],
  meowth: [
    { name: 'Pay Day', effect: 'stars', color: 0xffd700, text: 'Coins scattered everywhere!' },
    { name: 'Fury Swipes', effect: 'slash' }, { name: 'Bite', effect: 'impact' },
    { name: 'Screech', effect: 'rings', color: 0xe8e8e8 }
  ],
  metapod: [{ name: 'Harden', effect: 'shield' }],
  mew: [
    { name: 'Psychic', effect: 'rings', color: 0xff6ad5 }, { name: 'Transform', effect: 'transform' },
    { name: 'Mega Punch', effect: 'impact' }
  ],
  mewtwo: [
    { name: 'Psychic', effect: 'rings', color: 0xff6ad5 }, { name: 'Barrier', effect: 'shield' },
    { name: 'Recover', effect: 'heal' }, { name: 'Swift', effect: 'stars' }
  ],
  moltres: [
    { name: 'Fire Spin', effect: 'flame' }, { name: 'Sky Attack', effect: 'wind' },
    { name: 'Agility', effect: 'teleport' }, { name: 'Peck', effect: 'impact' }
  ],
  mrmime: [
    { name: 'Barrier', effect: 'shield' }, { name: 'Confusion', effect: 'rings', color: 0xd88aff },
    { name: 'Double Slap', effect: 'impact' }
  ],
  muk: [
    { name: 'Sludge', effect: 'sludge', color: 0x9a5ac8 }, { name: 'Poison Gas', effect: 'powder', color: 0x9a6ac8 },
    { name: 'Body Slam', effect: 'tackle' }, { name: 'Acid Armor', effect: 'shield', color: 0x9a6ac8 }
  ],
  nidoking: [
    { name: 'Horn Attack', effect: 'tackle' }, { name: 'Poison Sting', effect: 'sludge' },
    { name: 'Earthquake', effect: 'quake' }, { name: 'Double Kick', effect: 'impact' }
  ],
  nidoqueen: [
    { name: 'Body Slam', effect: 'tackle' }, { name: 'Poison Sting', effect: 'sludge' },
    { name: 'Scratch', effect: 'slash' }, { name: 'Earthquake', effect: 'quake' }
  ],
  nidoran_female: [
    { name: 'Scratch', effect: 'slash' }, { name: 'Poison Sting', effect: 'sludge' }, { name: 'Growl', effect: 'notes' }
  ],
  nidoran_male: [
    { name: 'Horn Attack', effect: 'tackle' }, { name: 'Poison Sting', effect: 'sludge' },
    { name: 'Double Kick', effect: 'impact' }
  ],
  nidorina: [
    { name: 'Scratch', effect: 'slash' }, { name: 'Bite', effect: 'impact' }, { name: 'Poison Sting', effect: 'sludge' }
  ],
  nidorino: [
    { name: 'Horn Attack', effect: 'tackle' }, { name: 'Poison Sting', effect: 'sludge' },
    { name: 'Double Kick', effect: 'impact' }
  ],
  ninetales: [
    { name: 'Flamethrower', effect: 'flame' }, { name: 'Confuse Ray', effect: 'shadow', color: 0xffe066 },
    { name: 'Quick Attack', effect: 'tackle' }
  ],
  oddish: [
    { name: 'Absorb', effect: 'drain' }, { name: 'Sleep Powder', effect: 'powder', color: 0x8fd0ff },
    { name: 'Acid', effect: 'sludge' }
  ],
  omanyte: [
    { name: 'Water Gun', effect: 'spray' }, { name: 'Withdraw', effect: 'shield' },
    { name: 'Horn Attack', effect: 'tackle' }
  ],
  omastar: [
    { name: 'Hydro Pump', effect: 'spray' }, { name: 'Spike Cannon', effect: 'impact' },
    { name: 'Withdraw', effect: 'shield' }, { name: 'Horn Attack', effect: 'tackle' }
  ],
  onix: [
    { name: 'Rock Throw', effect: 'rocks' }, { name: 'Bind', effect: 'vines' }, { name: 'Slam', effect: 'tackle' },
    { name: 'Harden', effect: 'shield' }
  ],
  paras: [
    { name: 'Scratch', effect: 'slash' }, { name: 'Stun Spore', effect: 'powder', color: 0xf2d22e },
    { name: 'Leech Life', effect: 'drain' }
  ],
  parasect: [
    { name: 'Spore', effect: 'powder', color: 0xd8b46a }, { name: 'Slash', effect: 'slash' },
    { name: 'Leech Life', effect: 'drain' }
  ],
  persian: [
    { name: 'Slash', effect: 'slash' },
    { name: 'Pay Day', effect: 'stars', color: 0xffd700, text: 'Coins scattered everywhere!' },
    { name: 'Bite', effect: 'impact' }, { name: 'Screech', effect: 'rings', color: 0xe8e8e8 }
  ],
  pidgeot: [
    { name: 'Wing Attack', effect: 'wind' }, { name: 'Quick Attack', effect: 'tackle' },
    { name: 'Agility', effect: 'teleport' }, { name: 'Sand Attack', effect: 'powder', color: 0xd8b878 }
  ],
  pidgeotto: [
    { name: 'Gust', effect: 'wind' }, { name: 'Quick Attack', effect: 'tackle' },
    { name: 'Sand Attack', effect: 'powder', color: 0xd8b878 }
  ],
  pidgey: [
    { name: 'Gust', effect: 'wind' }, { name: 'Sand Attack', effect: 'powder', color: 0xd8b878 },
    { name: 'Quick Attack', effect: 'tackle' }
  ],
  pikachu: [
    { name: 'Thunderbolt', effect: 'bolt' }, { name: 'Quick Attack', effect: 'tackle' },
    { name: 'Thunder', effect: 'bolt' }, { name: 'Agility', effect: 'teleport' }
  ],
  pikachu_female: [
    { name: 'Thunderbolt', effect: 'bolt' }, { name: 'Quick Attack', effect: 'tackle' },
    { name: 'Thunder', effect: 'bolt' }, { name: 'Agility', effect: 'teleport' }
  ],
  pinsir: [
    { name: 'Vice Grip', effect: 'slash' }, { name: 'Seismic Toss', effect: 'impact' },
    { name: 'Guillotine', effect: 'slash' }, { name: 'Harden', effect: 'shield' }
  ],
  poliwag: [
    { name: 'Bubble', effect: 'bubbles' }, { name: 'Hypnosis', effect: 'rings', color: 0xb07aff },
    { name: 'Water Gun', effect: 'spray' }
  ],
  poliwhirl: [
    { name: 'Water Gun', effect: 'spray' }, { name: 'Hypnosis', effect: 'rings', color: 0xb07aff },
    { name: 'Double Slap', effect: 'impact' }, { name: 'Body Slam', effect: 'tackle' }
  ],
  poliwrath: [
    { name: 'Submission', effect: 'impact' }, { name: 'Hydro Pump', effect: 'spray' },
    { name: 'Hypnosis', effect: 'rings', color: 0xb07aff }, { name: 'Body Slam', effect: 'tackle' }
  ],
  ponyta: [
    { name: 'Ember', effect: 'flame' }, { name: 'Stomp', effect: 'tackle' }, { name: 'Agility', effect: 'teleport' }
  ],
  porygon: [
    { name: 'Psybeam', effect: 'beam', color: 0xff8ad8 }, { name: 'Tri Attack', effect: 'stars' },
    { name: 'Agility', effect: 'teleport' }, { name: 'Recover', effect: 'heal' }
  ],
  primeape: [
    { name: 'Fury Swipes', effect: 'slash' }, { name: 'Seismic Toss', effect: 'impact' },
    { name: 'Thrash', effect: 'tackle' }, { name: 'Screech', effect: 'rings', color: 0xe8e8e8 }
  ],
  psyduck: [
    { name: 'Confusion', effect: 'rings', color: 0xd88aff }, { name: 'Scratch', effect: 'slash' },
    { name: 'Water Gun', effect: 'spray' }
  ],
  raichu: [
    { name: 'Thunderbolt', effect: 'bolt' }, { name: 'Thunder Wave', effect: 'bolt' },
    { name: 'Quick Attack', effect: 'tackle' }, { name: 'Swift', effect: 'stars' }
  ],
  rapidash: [
    { name: 'Fire Spin', effect: 'flame' }, { name: 'Stomp', effect: 'tackle' }, { name: 'Agility', effect: 'teleport' }
  ],
  raticate: [
    { name: 'Hyper Fang', effect: 'impact' }, { name: 'Quick Attack', effect: 'tackle' },
    { name: 'Focus Energy', effect: 'shield' }
  ],
  rattata: [{ name: 'Quick Attack', effect: 'tackle' }, { name: 'Hyper Fang', effect: 'impact' }],
  rhydon: [
    { name: 'Horn Drill', effect: 'tackle' }, { name: 'Earthquake', effect: 'quake' },
    { name: 'Rock Slide', effect: 'rocks' }
  ],
  rhyhorn: [
    { name: 'Horn Attack', effect: 'tackle' }, { name: 'Fury Attack', effect: 'impact' },
    { name: 'Rock Slide', effect: 'rocks' }
  ],
  sandshrew: [
    { name: 'Scratch', effect: 'slash' }, { name: 'Sand Attack', effect: 'powder', color: 0xd8b878 },
    { name: 'Defense Curl', effect: 'shield' }
  ],
  sandslash: [
    { name: 'Slash', effect: 'slash' }, { name: 'Sand Attack', effect: 'powder', color: 0xd8b878 },
    { name: 'Poison Sting', effect: 'sludge' }, { name: 'Swift', effect: 'stars' }
  ],
  scyther: [
    { name: 'Slash', effect: 'slash' }, { name: 'Quick Attack', effect: 'tackle' },
    { name: 'Double Team', effect: 'teleport' }, { name: 'Wing Attack', effect: 'wind' }
  ],
  seadra: [
    { name: 'Hydro Pump', effect: 'spray' }, { name: 'Smokescreen', effect: 'powder', color: 0x5a5a5a },
    { name: 'Agility', effect: 'teleport' }, { name: 'Bubble Beam', effect: 'beam', color: 0x6ab8ff }
  ],
  seaking: [
    { name: 'Horn Drill', effect: 'tackle' }, { name: 'Waterfall', effect: 'spray' },
    { name: 'Supersonic', effect: 'rings', color: 0x9ad0ff }, { name: 'Agility', effect: 'teleport' }
  ],
  seel: [
    { name: 'Headbutt', effect: 'tackle' }, { name: 'Aurora Beam', effect: 'beam', color: 0xa0ffd8 },
    { name: 'Rest', effect: 'sleep', text: 'It started sleeping!' }, { name: 'Growl', effect: 'notes' }
  ],
  shellder: [
    { name: 'Withdraw', effect: 'shield' }, { name: 'Supersonic', effect: 'rings', color: 0x9ad0ff },
    { name: 'Clamp', effect: 'bubbles' }, { name: 'Aurora Beam', effect: 'beam', color: 0xa0ffd8 }
  ],
  slowbro: [
    { name: 'Psychic', effect: 'rings', color: 0xff6ad5 }, { name: 'Withdraw', effect: 'shield' },
    { name: 'Water Gun', effect: 'spray' }, { name: 'Headbutt', effect: 'tackle' }
  ],
  slowpoke: [
    { name: 'Confusion', effect: 'rings', color: 0xd88aff }, { name: 'Water Gun', effect: 'spray' },
    { name: 'Headbutt', effect: 'tackle' }, { name: 'Amnesia', effect: 'shield' }
  ],
  snorlax: [
    { name: 'Rest', effect: 'sleep', text: 'It started sleeping!' }, { name: 'Body Slam', effect: 'tackle' },
    { name: 'Amnesia', effect: 'shield' }, { name: 'Hyper Beam', effect: 'beam', color: 0xffe9a6 }
  ],
  spearow: [
    { name: 'Peck', effect: 'impact' }, { name: 'Growl', effect: 'notes' }, { name: 'Agility', effect: 'teleport' }
  ],
  squirtle: [
    { name: 'Tackle', effect: 'tackle' }, { name: 'Bubble', effect: 'bubbles' }, { name: 'Water Gun', effect: 'spray' },
    { name: 'Withdraw', effect: 'shield' }
  ],
  starmie: [
    { name: 'Swift', effect: 'stars' }, { name: 'Hydro Pump', effect: 'spray' }, { name: 'Recover', effect: 'heal' },
    { name: 'Psychic', effect: 'rings', color: 0xff6ad5 }
  ],
  staryu: [
    { name: 'Water Gun', effect: 'spray' }, { name: 'Swift', effect: 'stars' }, { name: 'Recover', effect: 'heal' },
    { name: 'Harden', effect: 'shield' }
  ],
  tangela: [
    { name: 'Vine Whip', effect: 'vines' }, { name: 'Absorb', effect: 'drain' },
    { name: 'Stun Spore', effect: 'powder', color: 0xf2d22e }, { name: 'Slam', effect: 'tackle' }
  ],
  tauros: [
    { name: 'Take Down', effect: 'tackle' }, { name: 'Earthquake', effect: 'quake' },
    { name: 'Hyper Beam', effect: 'beam', color: 0xffe9a6 }
  ],
  tentacool: [
    { name: 'Acid', effect: 'sludge' }, { name: 'Wrap', effect: 'vines' },
    { name: 'Supersonic', effect: 'rings', color: 0x9ad0ff }
  ],
  tentacruel: [
    { name: 'Hydro Pump', effect: 'spray' }, { name: 'Wrap', effect: 'vines' }, { name: 'Acid', effect: 'sludge' },
    { name: 'Barrier', effect: 'shield' }
  ],
  vaporeon: [
    { name: 'Hydro Pump', effect: 'spray' }, { name: 'Aurora Beam', effect: 'beam', color: 0xa0ffd8 },
    { name: 'Quick Attack', effect: 'tackle' }, { name: 'Acid Armor', effect: 'shield', color: 0x9a6ac8 }
  ],
  venomoth: [
    { name: 'Psybeam', effect: 'beam', color: 0xff8ad8 }, { name: 'Poison Powder', effect: 'powder', color: 0xb45ad8 },
    { name: 'Leech Life', effect: 'drain' }, { name: 'Supersonic', effect: 'rings', color: 0x9ad0ff }
  ],
  venonat: [
    { name: 'Tackle', effect: 'tackle' }, { name: 'Poison Powder', effect: 'powder', color: 0xb45ad8 },
    { name: 'Leech Life', effect: 'drain' }, { name: 'Confusion', effect: 'rings', color: 0xd88aff }
  ],
  venusaur: [
    { name: 'Solar Beam', effect: 'beam', color: 0xfff27a }, { name: 'Razor Leaf', effect: 'leaves' },
    { name: 'Vine Whip', effect: 'vines', from: 'top' },
    { name: 'Sleep Powder', effect: 'powder', color: 0x8fd0ff, from: 'top' }
  ],
  venusaur_female: [
    { name: 'Solar Beam', effect: 'beam', color: 0xfff27a }, { name: 'Razor Leaf', effect: 'leaves' },
    { name: 'Vine Whip', effect: 'vines', from: 'top' },
    { name: 'Sleep Powder', effect: 'powder', color: 0x8fd0ff, from: 'top' }
  ],
  victreebel: [
    { name: 'Razor Leaf', effect: 'leaves' }, { name: 'Vine Whip', effect: 'vines' },
    { name: 'Acid', effect: 'sludge' }, { name: 'Stun Spore', effect: 'powder', color: 0xf2d22e }
  ],
  vileplume: [
    { name: 'Petal Dance', effect: 'leaves' }, { name: 'Stun Spore', effect: 'powder', color: 0xf2d22e },
    { name: 'Acid', effect: 'sludge' }, { name: 'Mega Drain', effect: 'drain' }
  ],
  voltorb: [
    { name: 'Tackle', effect: 'tackle' }, { name: 'Screech', effect: 'rings', color: 0xe8e8e8 },
    { name: 'Self-Destruct', effect: 'explode' }, { name: 'Thunder Wave', effect: 'bolt' }
  ],
  vulpix: [
    { name: 'Ember', effect: 'flame' }, { name: 'Quick Attack', effect: 'tackle' },
    { name: 'Confuse Ray', effect: 'shadow', color: 0xffe066 }
  ],
  wartortle: [
    { name: 'Water Gun', effect: 'spray' }, { name: 'Bite', effect: 'impact' }, { name: 'Withdraw', effect: 'shield' },
    { name: 'Skull Bash', effect: 'tackle' }
  ],
  weedle: [{ name: 'Poison Sting', effect: 'sludge' }, { name: 'String Shot', effect: 'string' }],
  weepinbell: [
    { name: 'Razor Leaf', effect: 'leaves' }, { name: 'Wrap', effect: 'vines' }, { name: 'Acid', effect: 'sludge' },
    { name: 'Sleep Powder', effect: 'powder', color: 0x8fd0ff }
  ],
  weezing: [
    { name: 'Smog', effect: 'powder', color: 0x7a6a8a }, { name: 'Sludge', effect: 'sludge', color: 0x9a5ac8 },
    { name: 'Explosion', effect: 'explode' }, { name: 'Tackle', effect: 'tackle' }
  ],
  wigglytuff: [
    { name: 'Sing', effect: 'notes' }, { name: 'Double Slap', effect: 'impact' },
    { name: 'Body Slam', effect: 'tackle' }, { name: 'Rest', effect: 'sleep', text: 'It started sleeping!' }
  ],
  zapdos: [
    { name: 'Thunder', effect: 'bolt' }, { name: 'Drill Peck', effect: 'impact' },
    { name: 'Agility', effect: 'teleport' }, { name: 'Light Screen', effect: 'shield' }
  ],
  zubat: [
    { name: 'Leech Life', effect: 'drain' }, { name: 'Supersonic', effect: 'rings', color: 0x9ad0ff },
    { name: 'Wing Attack', effect: 'wind' }
  ],
}
