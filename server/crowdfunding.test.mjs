import assert from 'node:assert/strict';
import { test } from 'node:test';
import { donorList, donorName, parseCampaign, parseTiles } from './crowdfunding.mjs';

test('reads the raised total, and refuses a changed page', () => {
  const page = '<div class="single-project-top-dollar">\n  $1,098\n</div><div>Raised toward our $2,500 Goal</div>';
  assert.deepEqual(parseCampaign(page), { raised: 1098 });
  assert.throws(() => parseCampaign('<div>Raised toward our $2,500 Goal</div>'));
});

// Invented names, in the shapes the real wall produces.
const cases = {
  'a last name in the second field': [
    ['Ana', 'Reyes', 'Ana Reyes'],
    ['Mei Ling', 'Tan', 'Mei Ling Tan'],
    ['Ana', "Reyes '98", 'Ana Reyes'],
    ['Ana', 'Reyes, Class of 1998', 'Ana Reyes'],
    ['Ana', 'van der Berg', 'Ana van der Berg'],
    ['Ana', 'Smith-Jones', 'Ana Smith-Jones'],
  ],
  'a full name or signature in the message': [
    ['Ana', 'Ana Reyes', 'Ana Reyes'],
    ['ana', 'ana reyes', 'Ana Reyes'],
    ['Ana', "Go team! Ana Reyes '98", 'Ana Reyes'],
    ['Ana', 'Thanks for everything, Ana Reyes.', 'Ana Reyes'],
  ],
  'a dedication names someone else, never the donor': [
    ['Sam Ortiz', 'In Honor of Pat Quinn engineer club', 'Sam Ortiz'],
    ['sam ortiz', 'In Honor of Dedicated to Pat Quinn', 'Sam Ortiz'],
    ['Sam', 'In Honor of Sam Quinn', 'Sam'],
    ['Sam', 'In memory of Sam Quinn', 'Sam'],
    ['Sam', 'Dedicated to Pat Quinn', 'Sam'],
  ],
  'a message that is not a name': [
    ['Ana', 'Go Big Red', 'Ana'],
    ['Ana', 'Congrats!', 'Ana'],
    ['Ana', 'Thanks', 'Ana'],
    ['Ana', 'Pat Quinn', 'Ana'],
    ['Ana', 'Keep up the great work', 'Ana'],
    ['Ana', 'Ana loves this team', 'Ana'],
    ['Ana', '', 'Ana'],
  ],
  'no doubled names': [
    ['Ana Reyes', 'Reyes', 'Ana Reyes'],
    ['Ana Reyes', 'Ana Reyes', 'Ana Reyes'],
    ['Ana', 'Ana', 'Ana'],
  ],
  'capitalization': [
    ['john lau', '', 'John Lau'],
    ['JANE DOE', '', 'Jane Doe'],
    ['yr Tan', '', 'YR Tan'],
    ['ty lee', '', 'Ty Lee'],
    ['ng wei', '', 'Ng Wei'],
    ['DeShawn McKay', '', 'DeShawn McKay'],
    ['mary-jane o\'brien', '', "Mary-Jane O'Brien"],
    ['ian mcdonald', '', 'Ian McDonald'],
    ['anna van der berg', '', 'Anna van der Berg'],
    ['李明', '', '李明'],
  ],
};
for (const [what, rows] of Object.entries(cases)) {
  test(what, () => {
    for (const [name, note, want] of rows) assert.equal(donorName(name, note), want, `${name} / ${note}`);
  });
}

test('anything that is not a name is not shown', () => {
  for (const name of ['Anonymous', 'anonymous donor', '', 'a@b.com', 'crypto.com deals', 'see http://x.co', '12345', 'Ana 2', 'x'.repeat(60), '<b>Ana</b>']) {
    assert.equal(donorName(name), null, name);
  }
});

test('reads tiles, including entities and a tile with no second row', () => {
  const tile = (top, bottom, amount) => `<div class="donor-tile live"><h3 class="top-row">${top}</h3>${bottom ? `<h3 class="bottom-row">${bottom}</h3>` : ''}<h3 class="amount">${amount}<br></h3></div>`;
  assert.deepEqual(parseTiles(tile('O&#39;Neil &amp; Co', 'Reyes', '$1,000') + tile('Anonymous', '', 'Undisclosed Amount')), [
    { name: "O'Neil & Co", note: 'Reyes', amount: 1000 },
    { name: 'Anonymous', note: '', amount: 0 },
  ]);
});

test('lists each name once, leaves out the unnamed, and passes on nothing but names', () => {
  assert.deepEqual(donorList([
    { name: 'Ana', note: 'Reyes', amount: 20 },
    { name: 'ana reyes', note: 'Second gift, keep it up', amount: 20 },
    { name: 'Anonymous', note: '', amount: 5000 },
    { name: 'a@b.com', note: '', amount: 5000 },
    { name: 'Sam', note: 'In Honor of Pat Quinn', amount: 50 },
  ]), { names: ['Sam', 'Ana Reyes'] });
});

test('orders by amount: largest first, ties as the wall has them, undisclosed last', () => {
  const { names } = donorList([
    { name: 'Hidden', note: '', amount: 0 },
    { name: 'Small', note: '', amount: 20 },
    { name: 'First Tie', note: '', amount: 100 },
    { name: 'Second Tie', note: '', amount: 100 },
    { name: 'Big', note: '', amount: 1000 },
    { name: 'Repeat', note: '', amount: 60 },
    { name: 'Repeat', note: '', amount: 60 }, // two gifts rank by what they add up to
  ]);
  assert.deepEqual(names, ['Big', 'Repeat', 'First Tie', 'Second Tie', 'Small', 'Hidden']);
});
