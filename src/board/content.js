// Skyboard content: districts, track layout, Kindness Cards, Fact Cards, hero board powers.
// Pure data (no three.js) so the rules can run in node for balance tests.
// Tone: warm, playful, never a lecture. Every choice is playable; generous ones lift the TEAM.

export const DISTRICTS = [
  { id: 'bloom',     name: 'Bloom Gardens',    color: '#ff7fb8' },
  { id: 'clockwork', name: 'Clockwork Spires', color: '#e0ad4f' },
  { id: 'prism',     name: 'Prism Falls',      color: '#9b7bff' },
  { id: 'skyharbor', name: 'Skyharbor',        color: '#4fc3ff' },
  { id: 'lantern',   name: 'Lantern Market',   color: '#ff9a3c' },
  { id: 'hearth',    name: 'Hearthwood',       color: '#5fd46a' }
];

// 32-space ring. G gate, H help, K kindness, F fact, A echo ambush, P power, S seam portal, X shard.
export const TRACK = 'GHKAFHXPSHKAFHKPXHAKFHPKSHAXFHKP'.split('');
export const PORTALS = { 8: 24, 24: 8 };
export const SPACE_INFO = {
  G: { name: 'Welcome Gate', color: '#ffe27a', icon: 'gate' },
  H: { name: 'Help',         color: '#ff8fb8', icon: 'help' },
  K: { name: 'Kindness',     color: '#ffb36b', icon: 'kind' },
  F: { name: 'Fact',         color: '#7fd6ff', icon: 'fact' },
  A: { name: 'Echo Ambush',  color: '#b9b2d6', icon: 'echo' },
  P: { name: 'Power',        color: '#ffd84d', icon: 'power' },
  S: { name: 'Seam Portal',  color: '#a57bff', icon: 'portal' },
  X: { name: 'Shard',        color: '#9ff3ff', icon: 'shard' }
};
export const sectorOf = i => Math.floor(i * DISTRICTS.length / TRACK.length) % DISTRICTS.length;

// Board powers: each hero helps in a different way.
export const BOARD_POWERS = {
  ribbon:   { name: 'Rally Cry',        text: 'Every teammate gets +2 Glimmers. You get +1 Heart for the hype.' },
  chrona:   { name: 'Time Bubble',      text: 'Freeze the glass: push Lord Narrowmere\'s clock back 1.' },
  prism:    { name: 'Prism Split',      text: 'Split your light: +1 light to two different districts.' },
  verdant:  { name: 'Regrow',           text: 'The dimmest district blooms back: +2 light.' },
  fold:     { name: 'Crane Post',       text: 'Paper cranes carry help: +1 light to your district for free, +1 Glimmer.' },
  tinker:   { name: 'Beacon Build',     text: 'Build a Beacon on the dimmest district. It blocks the next two silverings.' },
  starling: { name: 'Gravity Star',     text: 'Pull teammates within 4 spaces to you (+1 Heart each) and catch a Shard.' }
};

// Effects: glim (you), heart (team), light {target:'sector'|'dimmest', n}, shard, clock, giveAll (you give each teammate 1)
export const KINDNESS = [
  { title: 'The Wobbly Landing', text: 'A young Glimmerling botched an airship landing. Everyone laughed. They look like they want to vanish.',
    options: [
      { label: 'Tell them about YOUR worst landing', fx: { heart: 2 }, out: 'They laugh WITH you now. Turns out your worst landing involved a duck.' },
      { label: 'Give them a high five', fx: { heart: 1, glim: 1 }, out: 'Solid high five. They tip you a Glimmer.' },
      { label: 'Keep flying', fx: { glim: 1 }, out: 'You keep going. Somebody else will help. Probably.' }] },
  { title: 'The Shiny Offer', text: 'A silver-suited merchant offers you 4 Glimmers if you look the other way while he polishes a few windows "mirror-bright".',
    options: [
      { label: 'No thanks. Not for sale.', fx: { heart: 1 }, out: 'The merchant sighs. Your reflection gives you a thumbs up.' },
      { label: 'Take the Glimmers', fx: { glim: 4, clock: 1 }, out: '+4 Glimmers... and somewhere, a window starts whispering. Narrowmere grins.' }] },
  { title: 'The Science Fair', text: 'Your friend\'s volcano project fizzled in front of the whole school. They\'re packing it up.',
    options: [
      { label: 'Help them figure out what went wrong', fx: { heart: 2, glim: -1 }, out: 'Too much water, not enough baking soda. Round two ERUPTS.' },
      { label: 'Say "it was still cool"', fx: { heart: 1 }, out: 'It was still cool. They smile a little.' }] },
  { title: 'Lost in Lantern Market', text: 'A tiny lantern-sprite is lost and crying. Its family is somewhere in the crowd.',
    options: [
      { label: 'Walk them to the Market center', fx: { heart: 1, light: { target: 'lantern', n: 1 } }, out: 'Reunited! Their whole family glows so bright the Market lights up.' },
      { label: 'Point the way', fx: { glim: 1 }, out: 'They find it. Eventually. After a detour through the soup stall.' }] },
  { title: 'Not Picked', text: 'Teams are being picked for sky-ball. One kid is left standing alone. Again.',
    options: [
      { label: 'Pick them first next round', fx: { heart: 2 }, out: 'They score the winning goal. Nobody saw that coming. Except you.' },
      { label: 'Share your snack with them', fx: { heart: 1, glim: -1 }, out: 'Snacks fix a surprising number of things.' },
      { label: 'Focus on the game', fx: { glim: 1 }, out: 'You win the game. It feels a little quieter than usual.' }] },
  { title: 'The Golden Crown', text: 'Narrowmere offers you a crown that makes everyone think you\'re the best. It\'s very sparkly.',
    options: [
      { label: 'Hand it back', fx: { heart: 1, glim: 1 }, out: 'You\'re already enough. The crown fizzles into a single honest Glimmer.' },
      { label: 'Try it on, just once', fx: { clock: 1, glim: 2 }, out: 'Everyone claps. It sounds hollow. The crown melts into silver dust.' }] },
  { title: 'The Brave Question', text: 'You don\'t understand the lesson at all. Everyone else seems to get it.',
    options: [
      { label: 'Raise your hand and ask', fx: { heart: 1, glim: 2 }, out: 'Three other kids whisper "thank you". You weren\'t the only one!' },
      { label: 'Nod and pretend', fx: { glim: -1 }, out: 'Pretending costs more than asking. Lesson... sort of learned.' }] },
  { title: 'The Neighbor\'s Garden', text: 'Old Mr. Fernwhistle\'s garden in Bloom Gardens is overgrown. He can\'t kneel anymore.',
    options: [
      { label: 'Spend an afternoon weeding', fx: { light: { target: 'bloom', n: 1 }, glim: -1, heart: 1 }, out: 'He tells you stories about dragons the whole time. Worth it.' },
      { label: 'Wave hello', fx: { heart: 1 }, out: 'He waves back with a trowel. It counts.' }] },
  { title: 'Group Project', text: 'Your team built something amazing. The teacher thinks it was all you.',
    options: [
      { label: 'Name everyone who helped', fx: { heart: 2, giveAll: 1 }, out: 'Everybody stands a little taller. You give each teammate 1 Glimmer.' },
      { label: 'Take the bow', fx: { glim: 2, clock: 1 }, out: 'Applause! A mirror somewhere gets a little more smug.' }] },
  { title: 'The Clock Tower Gear', text: 'A gear in Clockwork Spires is stuck. Fixing it means getting your hands VERY greasy.',
    options: [
      { label: 'Roll up your sleeves', fx: { light: { target: 'clockwork', n: 1 }, glim: -1 }, out: 'CLUNK. Tick. Tock. The Spires start singing again.' },
      { label: 'Report it to the Tinkers', fx: { heart: 1 }, out: 'Good call. Tinkers love a puzzle.' }] },
  { title: 'Mirror Comment', text: 'A mirror whispers: "Your art isn\'t as good as theirs."',
    options: [
      { label: '"I\'m still learning. That\'s the fun part."', fx: { heart: 1, glim: 1 }, out: 'The mirror goes quiet. Mirrors HATE that answer.' },
      { label: 'Tear up the drawing', fx: { clock: 1 }, out: 'The mirror grins. Narrowmere takes a step closer.' },
      { label: 'Show the drawing to a friend', fx: { heart: 2, glim: -1 }, out: 'Your friend asks you to teach them. Huh.' }] },
  { title: 'The Waterfall Rescue', text: 'Someone dropped their favorite hat into Prism Falls. It\'s bobbing toward the edge!',
    options: [
      { label: 'Dive for it', fx: { light: { target: 'prism', n: 1 }, heart: 1, glim: -1 }, out: 'Soaked, triumphant, and wearing someone else\'s hat. Legend.' },
      { label: 'Shout encouragement', fx: { heart: 1 }, out: '"YOU CAN DO IT!" They actually catch it. Teamwork.' }] },
  { title: 'Double Glimmers', text: 'You found a pouch of 3 Glimmers on the path. No name on it.',
    options: [
      { label: 'Turn it in at the Gate', fx: { heart: 2 }, out: 'The owner was a baker. You now have a lifetime supply of muffins.' },
      { label: 'Share it with the team', fx: { giveAll: 1, heart: 1, glim: 3 }, out: 'Finders, sharers. Everyone gets one.' },
      { label: 'Keep it', fx: { glim: 3 }, out: '+3 Glimmers. They feel a little heavy.' }] },
  { title: 'The New Kid', text: 'A new family just moved into Hearthwood. Their kid is sitting alone on the steps.',
    options: [
      { label: 'Show them the secret tree fort', fx: { light: { target: 'hearth', n: 1 }, heart: 1 }, out: 'Best fort tour ever. Hearthwood just got a little warmer.' },
      { label: 'Say hi on your way past', fx: { heart: 1 }, out: 'Small hellos are bigger than they look.' }] },
  { title: 'Sky Dock Shift', text: 'The Skyharbor crew is short-handed and a storm is rolling in.',
    options: [
      { label: 'Help tie down the airships', fx: { light: { target: 'skyharbor', n: 1 }, glim: -1 }, out: 'Every ship is safe. The captain names a cloud after you.' },
      { label: 'Bring everyone cocoa', fx: { heart: 1, glim: -1 }, out: 'Morale: maximum. Cocoa: also maximum.' },
      { label: 'Watch from the tower', fx: { glim: 1 }, out: 'Great view. Slightly guilty view.' }] },
  { title: 'The Apology', text: 'You snapped at a friend earlier. You were tired, but that\'s not their fault.',
    options: [
      { label: 'Say sorry, for real', fx: { heart: 2 }, out: 'They say "thanks for saying that." Friendship: upgraded.' },
      { label: 'Act like it never happened', fx: { glim: 1, clock: 1 }, out: 'It kind of hangs in the air. Mirrors love that stuff.' }] }
];

// Widely verified facts only. Each is a 2-3 option question with one correct answer.
export const FACTS = [
  { q: 'How many hearts does an octopus have?', a: ['Three', 'One', 'Eight'], c: 0, why: 'Octopuses have three hearts: two pump blood to the gills, one to the body.' },
  { q: 'Which planet is closest to the Sun?', a: ['Venus', 'Mercury', 'Mars'], c: 1, why: 'Mercury is the closest planet to the Sun.' },
  { q: 'Does sound travel faster in water or in air?', a: ['Air', 'Water'], c: 1, why: 'Sound moves about four times faster in water than in air.' },
  { q: 'Can you see the Great Wall of China from the Moon with just your eyes?', a: ['Yes', 'No'], c: 1, why: 'No. It is far too narrow to see from the Moon without help.' },
  { q: 'Botanically, which of these is a berry?', a: ['Strawberry', 'Banana'], c: 1, why: 'Bananas are berries to botanists. Strawberries are not!' },
  { q: 'How long does sunlight take to reach Earth?', a: ['About 8 minutes', 'About 8 seconds', 'About 8 hours'], c: 0, why: 'Sunlight takes about 8 minutes and 20 seconds to reach us.' },
  { q: 'Are bats blind?', a: ['Yes', 'No'], c: 1, why: 'No. Bats can see, and many also use echoes to find their way.' },
  { q: 'How many bones does an adult human have?', a: ['106', '206', '306'], c: 1, why: 'Adults have 206 bones. Babies start with more, and some fuse together.' },
  { q: 'What is the largest planet in our solar system?', a: ['Saturn', 'Jupiter', 'Neptune'], c: 1, why: 'Jupiter is the biggest planet, more than 11 times wider than Earth.' },
  { q: 'Is a spider an insect?', a: ['Yes', 'No'], c: 1, why: 'No. Spiders are arachnids: eight legs instead of six.' },
  { q: 'Where do wild penguins live?', a: ['Mostly the Southern Hemisphere', 'The North Pole'], c: 0, why: 'Wild penguins live almost entirely south of the equator. None live at the North Pole.' },
  { q: 'Does water boil at a lower temperature high on a mountain?', a: ['Yes', 'No'], c: 0, why: 'Yes. Lower air pressure up high lets water boil at a lower temperature.' },
  { q: 'Which is hotter?', a: ['A lightning bolt', 'The surface of the Sun'], c: 0, why: 'A lightning bolt can be several times hotter than the Sun\'s surface.' },
  { q: 'What is a group of flamingos called?', a: ['A flamboyance', 'A fluster', 'A parade'], c: 0, why: 'A group of flamingos is called a flamboyance. Fabulous.' },
  { q: 'Which is longer on Venus: a day or a year?', a: ['A day', 'A year'], c: 0, why: 'Venus spins so slowly that one Venus day is longer than its year.' },
  { q: 'How do plants make food from sunlight?', a: ['Photosynthesis', 'Hibernation'], c: 0, why: 'Photosynthesis turns sunlight, water and air into plant food, and releases oxygen.' },
  { q: 'Which is the tallest mountain above sea level?', a: ['K2', 'Mount Everest', 'Kilimanjaro'], c: 1, why: 'Mount Everest stands about 8,849 meters above sea level.' },
  { q: 'Honeybees talk to each other partly by...', a: ['Dancing', 'Whistling'], c: 0, why: 'Honeybees do a "waggle dance" to show others where flowers are.' }
];

export const HERO_LINES = {
  win: 'You did it together. Not by owning the most, but by lifting each other up. Aurelia shines!',
  lose: 'The glass wins this round. That\'s okay. Every hero has a do-over. Try again!',
  showdown: 'Every district is shining! The Ever-Glass rises from the center. Time to face it, together.',
  start: 'Welcome to Skyboard! We don\'t win by owning stuff. We win by helping Aurelia shine. Restore every district, gather the Shards, then seal the Ever-Glass.'
};

export const NARROWMERE_LINES = [
  'Why share? Keep it all for yourself.',
  'Only the shiniest matter.',
  'Nobody notices kindness. Everyone notices a crown.',
  'Look at me. Only me.',
  'Mirror, mirror... it\'s always me.',
  'Help them? What\'s in it for you?'
];
