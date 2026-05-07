// Seed data for InteriorOS — Hyderabad studio

const PROJECTS = [
  { id: 'p1', name: 'Koramandal Residence',  client: 'Vikram Reddy',      type: 'Residential — 4BHK Villa',   location: 'Jubilee Hills',     budget: 4200000, spent: 2870000, progress: 68, status: 'Active',    start: '2026-01-14', end: '2026-07-30', team: 6 },
  { id: 'p2', name: 'Arq. Office Fitout',    client: 'Meher Architects',  type: 'Commercial — Studio Office', location: 'Banjara Hills',     budget: 1850000, spent: 1210000, progress: 65, status: 'Active',    start: '2026-02-02', end: '2026-06-10', team: 4 },
  { id: 'p3', name: 'Jubilee Hills 3BHK',    client: 'Sanjana Rao',       type: 'Residential — 3BHK Apt.',     location: 'Jubilee Hills',    budget:  980000, spent:  640000, progress: 71, status: 'Active',    start: '2026-01-28', end: '2026-05-20', team: 3 },
  { id: 'p4', name: 'Sahifa Café Interiors', client: 'Sahifa Restaurants',type: 'Hospitality — Café',          location: 'Kondapur',         budget: 2650000, spent:  420000, progress: 18, status: 'Active',    start: '2026-03-20', end: '2026-08-15', team: 5 },
  { id: 'p5', name: 'Banjara Penthouse',     client: 'Aarav Malhotra',    type: 'Residential — Penthouse',     location: 'Banjara Hills',    budget: 6800000, spent: 6400000, progress: 96, status: 'On Hold',   start: '2025-09-11', end: '2026-04-30', team: 7 },
  { id: 'p6', name: 'Gachibowli Villa',      client: 'Shreya & Karthik',  type: 'Residential — Duplex Villa',  location: 'Gachibowli',       budget: 3400000, spent: 3400000, progress: 100,status: 'Completed', start: '2025-07-04', end: '2026-02-18', team: 5 },
];

const CATEGORIES = [
  { key: 'furniture',   label: 'Furniture',    icon: 'sofa' },
  { key: 'lighting',    label: 'Lighting',     icon: 'lamp' },
  { key: 'paint',       label: 'Paint',        icon: 'paint' },
  { key: 'flooring',    label: 'Flooring',     icon: 'ruler' },
  { key: 'plumbing',    label: 'Plumbing',     icon: 'water' },
  { key: 'electrical',  label: 'Electrical',   icon: 'flame' },
  { key: 'carpentry',   label: 'Carpentry',    icon: 'hammer' },
  { key: 'hardware',    label: 'Hardware',     icon: 'tool' },
  { key: 'fabric',      label: 'Fabric',       icon: 'package' },
  { key: 'decor',       label: 'Décor',        icon: 'gift' },
  { key: 'kitchen',     label: 'Kitchen',      icon: 'sofa' },
  { key: 'bath',        label: 'Bathware',     icon: 'water' },
  { key: 'tiles',       label: 'Tiles',        icon: 'ruler' },
  { key: 'marble',      label: 'Marble',       icon: 'ruler' },
  { key: 'glass',       label: 'Glass',        icon: 'image' },
  { key: 'curtains',    label: 'Curtains',     icon: 'package' },
  { key: 'appliances',  label: 'Appliances',   icon: 'cog' },
  { key: 'wallpaper',   label: 'Wallpaper',    icon: 'image' },
  { key: 'false_ceil',  label: 'False Ceiling',icon: 'ruler' },
  { key: 'polish',      label: 'Polishing',    icon: 'brush' },
  { key: 'transport',   label: 'Transport',    icon: 'truck' },
  { key: 'labour',      label: 'Labour',       icon: 'users' },
  { key: 'consult',     label: 'Consultant',   icon: 'user' },
  { key: 'permits',     label: 'Permits',      icon: 'shield' },
  { key: 'misc',        label: 'Misc',         icon: 'folder' },
  { key: 'travel',      label: 'Travel',       icon: 'pin' },
  { key: 'food',        label: 'Site Food',    icon: 'gift' },
];

const VENDORS = [
  { id: 'v1', name: 'Godrej Interio',       role: 'Furniture supplier',   phone: '+91 98480 12234', balance: -142000, type: 'Vendor' },
  { id: 'v2', name: 'Asian Paints Studio',  role: 'Paint supplier',       phone: '+91 98490 88712', balance:   24500, type: 'Vendor' },
  { id: 'v3', name: 'Lafarge Marble Co.',   role: 'Stone & marble',        phone: '+91 91009 22145', balance: -286000, type: 'Vendor' },
  { id: 'v4', name: 'Sri Lakshmi Timbers',  role: 'Plywood, veneer',       phone: '+91 94401 66213', balance: -68500,  type: 'Vendor' },
  { id: 'v5', name: 'Havells Lighting',     role: 'Lighting & fixtures',   phone: '+91 93960 15533', balance:       0, type: 'Vendor' },
  { id: 's1', name: 'Ravi Prakash',         role: 'Site Supervisor',       phone: '+91 94907 01234', balance:  -18000, type: 'Staff' },
  { id: 's2', name: 'Sunita Iyer',          role: 'Project Manager',       phone: '+91 98765 44321', balance:       0, type: 'Staff' },
  { id: 'c1', name: 'Vikram Reddy',         role: 'Client — Koramandal',   phone: '+91 98490 11122', balance:  480000, type: 'Client' },
  { id: 'c2', name: 'Sanjana Rao',          role: 'Client — Jubilee 3BHK', phone: '+91 90104 55821', balance:  120000, type: 'Client' },
  { id: 'c3', name: 'Meher Architects',     role: 'Client — Office Fitout',phone: '+91 98889 72210', balance:  340000, type: 'Client' },
  { id: 'sb1',name: 'Hameed Carpentry',     role: 'Subcontractor',         phone: '+91 91234 56780', balance: -42000,  type: 'Subcontractor' },
  { id: 'sb2',name: 'Venkat Electricals',   role: 'Subcontractor',         phone: '+91 98123 44556', balance:  -9500,  type: 'Subcontractor' },
];

const EXPENSES = [
  { id: 'e1',  project: 'p1', category: 'marble',     vendor: 'Lafarge Marble Co.',   amount: 186000, mode: 'Bank Transfer', note: 'Italian marble — living room',       date: '2026-04-19T09:12:00', status: 'Posted', by: 'You' },
  { id: 'e2',  project: 'p2', category: 'furniture',  vendor: 'Godrej Interio',       amount:  84200, mode: 'UPI',            note: 'Conference table + 8 chairs',         date: '2026-04-19T08:05:00', status: 'Posted', by: 'You' },
  { id: 'e3',  project: 'p3', category: 'paint',      vendor: 'Asian Paints Studio',  amount:  22400, mode: 'UPI',            note: 'Primer + emulsion, living + dining',  date: '2026-04-18T17:40:00', status: 'Pending', by: 'Ravi Prakash' },
  { id: 'e4',  project: 'p1', category: 'electrical', vendor: 'Venkat Electricals',   amount:  48600, mode: 'Cash',           note: 'Wiring — 2nd floor',                  date: '2026-04-18T14:20:00', status: 'Posted', by: 'You' },
  { id: 'e5',  project: 'p4', category: 'carpentry',  vendor: 'Hameed Carpentry',     amount:  32000, mode: 'UPI',            note: 'Bar counter framing',                 date: '2026-04-17T11:10:00', status: 'Posted', by: 'You' },
  { id: 'e6',  project: 'p1', category: 'transport',  vendor: 'Local truck',          amount:   3800, mode: 'Cash',           note: 'Marble delivery — Godown → site',     date: '2026-04-17T10:00:00', status: 'Pending', by: 'Ravi Prakash' },
  { id: 'e7',  project: 'p2', category: 'lighting',   vendor: 'Havells Lighting',     amount:  58400, mode: 'Bank Transfer',  note: 'Track lights x14, pendants x6',       date: '2026-04-16T16:25:00', status: 'Posted', by: 'You' },
  { id: 'e8',  project: 'p3', category: 'tiles',      vendor: 'Nitco Tiles',          amount:  41200, mode: 'Bank Transfer',  note: 'Bathroom tiles — 3 washrooms',        date: '2026-04-15T13:50:00', status: 'Posted', by: 'You' },
  { id: 'e9',  project: 'p1', category: 'labour',     vendor: 'Site Labour Pool',     amount:  24000, mode: 'Cash',           note: 'Weekly — 8 men × 3 days',             date: '2026-04-14T18:00:00', status: 'Posted', by: 'Ravi Prakash' },
  { id: 'e10', project: 'p5', category: 'decor',      vendor: 'The Decor House',      amount:  14500, mode: 'UPI',            note: 'Brass accents — entryway',            date: '2026-04-13T12:30:00', status: 'Posted', by: 'You' },
  { id: 'e11', project: 'p4', category: 'false_ceil', vendor: 'Saint-Gobain',         amount:  72000, mode: 'Bank Transfer',  note: 'Gypsum board + channels',             date: '2026-04-12T09:45:00', status: 'Posted', by: 'You' },
];

const INCOME = [
  { id: 'i1', project: 'p1', from: 'Vikram Reddy',     amount: 1000000, note: 'Second installment',      date: '2026-04-15T10:00:00', mode: 'Bank Transfer' },
  { id: 'i2', project: 'p2', from: 'Meher Architects', amount:  600000, note: 'Milestone 2 — carpentry', date: '2026-04-10T12:00:00', mode: 'Bank Transfer' },
  { id: 'i3', project: 'p3', from: 'Sanjana Rao',      amount:  300000, note: 'Advance — fittings',      date: '2026-04-04T11:30:00', mode: 'Bank Transfer' },
];

const APPROVALS = [
  { id: 'a1', project: 'p3', submitter: 'Ravi Prakash', amount:  22400, category: 'paint',     note: 'Primer + emulsion, living + dining', submitted: '2026-04-18T17:40:00' },
  { id: 'a2', project: 'p1', submitter: 'Ravi Prakash', amount:   3800, category: 'transport', note: 'Marble delivery',                    submitted: '2026-04-17T10:00:00' },
  { id: 'a3', project: 'p4', submitter: 'Ravi Prakash', amount:  12500, category: 'food',      note: 'Site tea + lunch — 11 workers',      submitted: '2026-04-16T19:10:00' },
  { id: 'a4', project: 'p1', submitter: 'Ravi Prakash', amount:   7200, category: 'hardware',  note: 'Hinges, screws, brackets',           submitted: '2026-04-16T11:00:00' },
];

const TASKS = [
  { id: 't1', title: 'Walkthrough with Vikram Reddy',    project: 'p1', due: '2026-04-19T17:00:00', done: false, tag: 'Today' },
  { id: 't2', title: 'Approve electrical quote',          project: 'p1', due: '2026-04-19T14:00:00', done: false, tag: 'Today' },
  { id: 't3', title: 'Order pendant lights — office',     project: 'p2', due: '2026-04-21T10:00:00', done: false, tag: 'Upcoming' },
  { id: 't4', title: 'Follow up on marble invoice',        project: 'p1', due: '2026-04-17T10:00:00', done: false, tag: 'Overdue' },
  { id: 't5', title: 'Client call — Sanjana',            project: 'p3', due: '2026-04-19T11:00:00', done: true,  tag: 'Today' },
];

window.PROJECTS = PROJECTS;
window.CATEGORIES = CATEGORIES;
window.VENDORS = VENDORS;
window.EXPENSES = EXPENSES;
window.INCOME = INCOME;
window.APPROVALS = APPROVALS;
window.TASKS = TASKS;

// ── Organizations
const ORGS = [
  { id: 'o1', name: 'Studio Atelier',     short: 'SA', city: 'Hyderabad', members: 12, active: 4, color: '#2563EB', role: 'Owner' },
  { id: 'o2', name: 'Helix Build',        short: 'HB', city: 'Bengaluru', members:  8, active: 2, color: '#0D9488', role: 'Member' },
  { id: 'o3', name: 'Form & Foundry',     short: 'FF', city: 'Mumbai',    members:  5, active: 3, color: '#9333EA', role: 'Member' },
];

// per-org expense roll-ups (for cross-org visibility)
const ORG_FINANCE = {
  o1: { mtdSpent: 562400, mtdReceived: 1900000, projects: 4, pendingApprovals: 4 },
  o2: { mtdSpent: 184000, mtdReceived:  420000, projects: 2, pendingApprovals: 1 },
  o3: { mtdSpent: 318500, mtdReceived:  720000, projects: 3, pendingApprovals: 2 },
};

// ── Leads (sales pipeline)
const LEADS = [
  { id: 'l1',  name: 'Aisha Verma',          phone: '+91 99201 55812', source: 'Instagram',   stage: 'New',         budget:  900000, type: '3BHK Apt.',         city: 'Madhapur',     created: '2026-04-22', score: 'Hot',  note: 'Referred by Sanjana Rao. Wants modular kitchen.' },
  { id: 'l2',  name: 'Rohan & Priya',        phone: '+91 91234 78090', source: 'Referral',    stage: 'Contacted',   budget: 1800000, type: '4BHK Villa',        city: 'Kondapur',     created: '2026-04-21', score: 'Hot',  note: '' },
  { id: 'l3',  name: 'Tanay Gupta',          phone: '+91 98480 11102', source: 'Website',     stage: 'Qualified',   budget:  450000, type: '2BHK — partial',    city: 'Manikonda',    created: '2026-04-20', score: 'Warm', note: 'Only living + master bedroom.' },
  { id: 'l4',  name: 'Cafe Bricklane',       phone: '+91 90100 22884', source: 'Walk-in',     stage: 'Proposal',    budget: 2200000, type: 'Café Fitout',       city: 'Jubilee Hills',created: '2026-04-18', score: 'Hot',  note: 'Need turnkey + signage. Decision by month-end.' },
  { id: 'l5',  name: 'Niharika Suri',        phone: '+91 99999 12233', source: 'Instagram',   stage: 'Proposal',    budget:  720000, type: '2BHK Apt.',         city: 'Gachibowli',   created: '2026-04-16', score: 'Warm', note: '' },
  { id: 'l6',  name: 'Dr. Saurabh Kapoor',   phone: '+91 98215 60012', source: 'Google Ads',  stage: 'Negotiation', budget: 1450000, type: 'Clinic Interior',   city: 'Banjara Hills',created: '2026-04-12', score: 'Hot',  note: 'Awaiting BOQ rev2.' },
  { id: 'l7',  name: 'Aarav & Tara',         phone: '+91 91101 87766', source: 'Referral',    stage: 'Won',         budget: 3200000, type: '4BHK Villa',        city: 'Tellapur',     created: '2026-04-02', score: 'Hot',  note: 'Converted to project — kickoff scheduled.' },
  { id: 'l8',  name: 'Mehul Shah',           phone: '+91 99887 11200', source: 'Instagram',   stage: 'Lost',        budget:  380000, type: '2BHK — modular',    city: 'Miyapur',      created: '2026-03-28', score: 'Cold', note: 'Went with competitor on price.' },
  { id: 'l9',  name: 'Dev Studios LLP',      phone: '+91 80004 12388', source: 'LinkedIn',    stage: 'Contacted',   budget: 5400000, type: 'Office — 12 seat', city: 'Hitech City',  created: '2026-04-23', score: 'Warm', note: '' },
  { id: 'l10', name: 'Anitha Sharma',        phone: '+91 90909 11212', source: 'Walk-in',     stage: 'New',         budget:  250000, type: 'Single Room',       city: 'Mehdipatnam',  created: '2026-04-23', score: 'Cold', note: '' },
];

// ── Appointments
const APPOINTMENTS = [
  { id: 'ap1', title: 'Site walkthrough — Koramandal',  with: 'Vikram Reddy',     where: 'Site · Jubilee Hills',  start: '2026-04-25T10:30:00', end: '2026-04-25T11:30:00', kind: 'Site',     stage: 'Confirmed', leadId: null,   projectId: 'p1' },
  { id: 'ap2', title: 'Design review — Kitchen v3',     with: 'Sanjana Rao',      where: 'Studio · Banjara',      start: '2026-04-25T14:00:00', end: '2026-04-25T15:00:00', kind: 'Review',   stage: 'Confirmed', leadId: null,   projectId: 'p3' },
  { id: 'ap3', title: 'Lead pitch — Cafe Bricklane',    with: 'Cafe Bricklane',   where: 'Café · Jubilee Hills',  start: '2026-04-25T17:30:00', end: '2026-04-25T18:30:00', kind: 'Pitch',    stage: 'Tentative', leadId: 'l4',  projectId: null },
  { id: 'ap4', title: 'Vendor meet — marble samples',   with: 'Lafarge Marble',   where: 'Showroom · Begumpet',    start: '2026-04-26T11:00:00', end: '2026-04-26T12:00:00', kind: 'Vendor',   stage: 'Confirmed', leadId: null,   projectId: 'p1' },
  { id: 'ap5', title: 'BOQ walkthrough',                with: 'Dr. Saurabh Kapoor',where: 'Video call',           start: '2026-04-26T16:00:00', end: '2026-04-26T16:45:00', kind: 'Pitch',    stage: 'Confirmed', leadId: 'l6',  projectId: null },
  { id: 'ap6', title: 'Sign-off — Office Fitout',       with: 'Meher Architects', where: 'Studio · Banjara',      start: '2026-04-27T11:00:00', end: '2026-04-27T12:00:00', kind: 'Review',   stage: 'Confirmed', leadId: null,   projectId: 'p2' },
  { id: 'ap7', title: 'New enquiry — Aisha Verma',      with: 'Aisha Verma',      where: 'Studio · Banjara',      start: '2026-04-27T15:30:00', end: '2026-04-27T16:00:00', kind: 'Pitch',    stage: 'Tentative', leadId: 'l1',  projectId: null },
];

window.ORGS = ORGS;
window.ORG_FINANCE = ORG_FINANCE;
window.LEADS = LEADS;
window.APPOINTMENTS = APPOINTMENTS;
