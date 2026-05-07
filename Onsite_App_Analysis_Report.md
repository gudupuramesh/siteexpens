# Onsite App — Detailed Screen Analysis Report

**App Name:** Onsite (com.onsiteteams.onsite)  
**Version:** 14.8.2  
**Platform:** iOS (iPhone 13)  
**Company Profile:** Happy Interior  
**Report Date:** April 11, 2026  
**Analysis Method:** Live screen observation via iPhone Mirroring

---

## Table of Contents

1. [App Overview](#1-app-overview)
2. [App Architecture & Navigation Model](#2-app-architecture--navigation-model)
3. [Screen-by-Screen Analysis](#3-screen-by-screen-analysis)
   - [S1 — Splash Screen](#s1--splash-screen)
   - [S2 — Projects Dashboard (Home)](#s2--projects-dashboard-home)
   - [S3 — Sidebar Menu](#s3--sidebar-menu)
   - [S4 — Quotation List](#s4--quotation-list)
   - [S5 — Quotation Detail](#s5--quotation-detail)
   - [S6 — Parties List](#s6--parties-list)
   - [S7 — Upgrade / Pricing Screen](#s7--upgrade--pricing-screen)
   - [S8 — Chat Groups](#s8--chat-groups)
   - [S9 — Chat Conversation](#s9--chat-conversation)
   - [S10 — Project Detail: Transaction Tab](#s10--project-detail-transaction-tab)
   - [S11 — Project Detail: Party Tab](#s11--project-detail-party-tab)
   - [S12 — Project Detail: Site Tab](#s12--project-detail-site-tab)
   - [S13 — Project Detail: Task Tab](#s13--project-detail-task-tab)
   - [S14 — Project Detail: Attendance Tab](#s14--project-detail-attendance-tab)
   - [S15 — Project Detail: Material Tab](#s15--project-detail-material-tab)
   - [S16 — Project Detail: MOM Tab](#s16--project-detail-mom-tab)
   - [S17 — Project Detail: Design Tab](#s17--project-detail-design-tab)
   - [S18 — Project Detail: Files Tab](#s18--project-detail-files-tab)
4. [Screen Connection Flow Diagram](#4-screen-connection-flow-diagram)
5. [Feature Summary by Module](#5-feature-summary-by-module)
6. [Monetisation & Access Control](#6-monetisation--access-control)
7. [Key Observations & Insights](#7-key-observations--insights)

---

## 1. App Overview

**Onsite** is a comprehensive **interior design and construction project management** mobile app targeted at interior designers, contractors, and small-to-medium construction firms. It allows businesses to manage the entire lifecycle of a project — from client quotations and vendor management to daily site reporting, material tracking, attendance, and financial transactions.

The app is branded per company (e.g., "Happy Interior") and supports multi-project management, team collaboration, and real-time financial summaries. It offers a freemium model with paid Business and Business Plus tiers.

---

## 2. App Architecture & Navigation Model

### Primary Navigation (Bottom Tab Bar)

The app uses a **persistent bottom tab bar** with 4 main sections:

| Tab | Icon | Purpose |
|-----|------|---------|
| Quotation | Document icon | Create and manage client quotations |
| Projects | Building icon | Manage all projects and site work |
| Parties | People icon | Vendors, workers, clients, suppliers |
| Chats | Chat bubble icon | Internal team communication |

### Secondary Navigation

- **Hamburger Menu (☰):** Left-aligned in the header, opens a full sidebar with account/company settings and app-level features.
- **Header Icons:** Notification bell (🔔) and Desktop Link (🖥) are always visible on the right.
- **In-Screen Tabs:** Project Detail uses a **horizontal scrollable tab bar** with 9 sub-sections.

### Navigation Pattern

The app follows a standard **Hierarchical (Drill-down)** navigation pattern:

```
Bottom Tab → List Screen → Detail Screen → Sub-tabs / Actions
```

A persistent header with a **back arrow (<)** allows return to the previous level at all times.

---

## 3. Screen-by-Screen Analysis

---

### S1 — Splash Screen

**Description:** The app opens with a full-screen red splash screen displaying a circular loading/progress indicator in white. This is a branded loading screen shown while the app initialises and connects to the backend.

**Key Elements:**
- Solid red background (brand colour)
- White circular loading spinner (centre)
- No text visible during load

**Connects to:** → S2 Projects Dashboard (on successful load)

---

### S2 — Projects Dashboard (Home)

**Screen Type:** Main home screen / hub  
**Accessed via:** App launch → after splash, or tapping "Projects" bottom tab

**Layout & Elements:**

**Header Bar:**
- Hamburger menu (☰) — opens sidebar
- Company name: "Happy Interior" with a sort/swap icon (↑↓)
- Notification bell (🔔)
- Desktop monitor icon (🖥) — Desktop Link shortcut

**Summary Pill Bar (3 Quick Counters):**
- **APPROVALS** — Pending: 0
- **MATERIAL REQUESTS** — Requests: 2 (highlighted in purple, indicating actionable items)
- **TO DO** — Pending: 0

**Quick Action Buttons (2 banner buttons):**
- 👑 **Upgrade Now** — links to the Pricing/Upgrade screen (S7)
- 🖥 **Desktop Link** — quick link to the desktop version

**Shortcut Icons (3 circular shortcuts):**
- 📋 **DPR** — Daily Progress Report creation shortcut
- 💰 **My Wallet** — financial wallet view
- ▶️ **Help Videos** — in-app tutorial videos

**Project List:**
- Filter dropdown (All / by status)
- Search icon (🔍)
- **+ Project** button (top right)
- Each project card shows:
  - Project name + location
  - Completion percentage (e.g., 20%)
  - Three-dot overflow menu (⋮) per project
  - **₹ In** (green) and **₹ Out** (red) financial summary
  - Chevron (>) to open Project Detail

**Sample Projects Displayed:**
| Project | Location | Progress | Amount In | Amount Out |
|---------|----------|----------|-----------|------------|
| Dr. Mounika | Kukatpally | 0% | ₹15,00,00,000 | ₹2,550 |
| Sai Krishna | Borabanda | 0% | ₹0 | ₹0 |
| Titania D402 | Kondapur | 20% | ₹5,31,690 | ₹1,26,126 |

**Connects to:**
- → S3 Sidebar Menu (via ☰)
- → S7 Upgrade Screen (via "Upgrade Now")
- → S10 Project Detail: Transaction Tab (via project card tap)
- → Notifications screen (via 🔔)

---

### S3 — Sidebar Menu

**Screen Type:** Slide-in drawer / side panel  
**Accessed via:** Hamburger menu (☰) on any main screen header

**Layout & Elements:**

**Company Header:**
- Company logo (circular "h" logo)
- Company name: "Happy Interior"
- Edit icon (✏️) — edit company profile

**Menu Items (with icons):**

| Menu Item | Description |
|-----------|-------------|
| 🏠 Home | Returns to Projects Dashboard |
| 👥 Roles & Access | Manage user roles and permissions |
| 💰 Payroll People | Staff payroll management |
| 📚 Master Library | Shared material/product library |
| ⚙️ Company Settings | App and company configuration |
| 💳 Business Card | Digital business card for the company |
| 👤 Invite Friends | Referral/invite feature |
| ❓ Customer Support | Contact support team |
| 💾 Backup (5:40 AM, 11 Apr) | Last backup timestamp + manual backup |
| 📝 Give Feedback | Submit in-app feedback |
| ⏻ Logout | Log out of the account |

**Footer:**
- App version: **14.8.2**
- Terms & Conditions (tappable link)

**Connects to:**
- Each menu item opens its respective settings or feature screen
- → S2 Home (via Home)

---

### S4 — Quotation List

**Screen Type:** List / index screen  
**Accessed via:** Tapping "Quotation" in the bottom tab bar

**Layout & Elements:**

**Header Bar:**
- Hamburger menu (☰), company name, sort icon (↑↓), notification bell, desktop icon

**Action Row:**
- Filter icon (🔻)
- Search icon (🔍)
- **+ New Quotation** button (top right)

**Quotation Cards:** Each card shows:
- Quotation name (custom label)
- Client/reference name
- Total amount (₹)
- Status badge (colour-coded dropdown):
  - 🟡 **Draft** — work in progress
  - 🔵 **In Discussion** — shared with client, being reviewed
- Three-dot menu (⋮) per quotation

**Sample Quotations:**
| Name | Client | Amount | Status |
|------|--------|--------|--------|
| Ghh | My Personal number | ₹0 | Draft |
| Raju | PR Kartheek | ₹8,260 | Draft |
| Quotation | Sri Laxmi | ₹8,39,309.5 | In Discussion |

**Connects to:**
- → S5 Quotation Detail (via tapping a quotation card)
- → New Quotation form (via "+ New Quotation")

---

### S5 — Quotation Detail

**Screen Type:** Detail / editing screen  
**Accessed via:** Tapping a quotation card in S4

**Layout & Elements:**

**Header:**
- Back arrow (<) — returns to S4
- Title: "Quotation" + client name subtitle (e.g., "Sri Laxmi")
- ⚙️ Settings icon — quotation configuration
- ⬇️ Download icon — download/export the quotation

**Metadata Row:**
- Quotation number (e.g., #19)
- Edit icon (✏️)
- Quotation Date (e.g., 14-02-2025)

**Status & Add Item Row:**
- Status badge dropdown (e.g., "In Discussion") — change status
- **+ Add Item** dropdown — add line items to the quotation

**Line Items (grouped by room/category):**
Each category is collapsible with a chevron (∨) and shows:
- Category name + subtotal
- Individual line items with material description + price

**Sample Line Items:**
| Category | Items | Subtotal |
|----------|-------|----------|
| TV Unit | Century Sainik 710 BWP + Wall elevation design | ₹1,13,492.5 |
| Crockery unit | Century Sainik 710 BWP (×2 variants) | ₹53,595 |
| Vanity unit | Century Sainik 710 BWP | ₹23,490 |
| Pooja | Century Sainik 710 BWP | ₹20,250 |
| Kitchen | (additional items) | — |

**Footer:**
- **Total: ₹8,39,309.5**
- Round off checkbox (☐)
- 📷 Camera icon — attach photos
- 🔼 Upload/share icon
- **Share** button — share quotation with client (PDF/WhatsApp etc.)

**Connects to:**
- → S4 Quotation List (via back arrow)
- → Item detail / edit (via line item tap)
- → Share dialog (via Share button)

---

### S6 — Parties List

**Screen Type:** List / index screen  
**Accessed via:** Tapping "Parties" in the bottom tab bar

**Layout & Elements:**

**Party Balances Summary Card (purple banner):**
- Total **To Pay**: ₹12,130
- Total **To Receive**: ₹0
- Gold coin icon

**Filter Row:**
- Filter icon (🔻)
- Sort icon (↑)
- Search icon (🔍)
- **Active** dropdown (Active / Inactive)
- Export icon
- **+ New Party** button

**Party Cards:** Each card shows:
- Party name
- Party type (Worker / Vendor / Material Supplier / Contractor)
- Amount (₹)
- Payment status (e.g., Advance Paid / Settled)

**Sample Parties:**
| Name | Type | Amount | Status |
|------|------|--------|--------|
| Abdul Granite worker | Worker | ₹6,100 | Advance Paid |
| Anusha Cx Kphp | Vendor | ₹5,050 | Advance Paid |
| Arjun | Vendor | ₹2,458 | Advance Paid |
| Auto | Material Supplier | ₹13,430 | Advance Paid |
| Balamurali CX Bheeramguda | Vendor | ₹0 | Settled |
| Carpainter Sunil Hyd Prasda Refe | Labour Contractor | ₹50,000 | Advance Paid |

**Connects to:**
- → S7 Upgrade/Pricing Screen (Party Detail is behind paywall — tapping a party triggers upgrade prompt)
- → New Party form (via "+ New Party")

---

### S7 — Upgrade / Pricing Screen

**Screen Type:** Modal / paywall overlay  
**Accessed via:** Tapping a party card in S6 (feature locked), or "Upgrade Now" banner in S2

**Layout & Elements:**

**Header:**
- Title: "Annual Paid plan"
- Subtitle: Company name (Happy Interior)
- Close button (✕)

**Plan Cards (side by side):**

| Plan | Price | Users |
|------|-------|-------|
| **Business** | ~~INR 40,000~~ → **INR 36,000/Year + GST** | 3 users |
| **Business Plus** ⭐ POPULAR | ~~INR 58,500~~ → **INR 45,000/Year + GST** | 3 users |

Both plans support mobile and desktop (icons shown).

**Feature List — "Everything in Business":**
- Bill of Quantity (BOQ) & RA Bills
- Budget Control
- Central Warehouse
- Purchase Orders
- Assets & Tools
- Equipment & Machinery
- (additional features below scroll)

**Footer:**
- **Contact Us** button (full-width, purple)

**Connects to:**
- → Payment/subscription flow (via Contact Us)
- → Previous screen (via ✕ close button)

---

### S8 — Chat Groups

**Screen Type:** List / index screen  
**Accessed via:** Tapping "Chats" in the bottom tab bar

**Layout & Elements:**

**Header:**
- Back arrow (<) — returns to previous screen
- Title: "Chat Groups"

**Chat Group Cards:** Each card shows:
- Group avatar/logo
- Group name
- Member count

**Sample Groups:**
| Group | Members |
|-------|---------|
| Onsite Announcements | 0 Members (system channel) |
| Ram | 2 Members (team group) |

**FAB Button:**
- ➕ Floating action button (bottom right) — create new chat group

**Connects to:**
- → S9 Chat Conversation (via tapping a group)
- → New Group creation (via ➕ FAB)

---

### S9 — Chat Conversation

**Screen Type:** Messaging/conversation view  
**Accessed via:** Tapping a chat group in S8

**Layout & Elements:**

**Header:**
- Back arrow (<) — returns to S8
- Contact/group avatar
- Group/contact name (e.g., "Ram")
- Three-dot menu (⋮) — group settings, members

**Message Area:**
- Patterned background (chat wallpaper)
- Messages displayed (WhatsApp-style bubbles)
- Loading spinner shown on first open

**Footer Input:**
- "Enter Message" text field
- (Implied: send, attachment buttons)

**Connects to:**
- → S8 Chat Groups (via back arrow)
- → Group info/settings (via ⋮ menu)

---

### S10 — Project Detail: Transaction Tab

**Screen Type:** Project sub-screen (financial ledger)  
**Accessed via:** Tapping a project card in S2, lands on Transaction tab by default

**Layout & Elements:**

**Project Header:**
- Back arrow (<) — returns to S2
- Project name (e.g., "Titania D402")
- 👍 Approval icon
- 🔔 Notification icon
- 📄 Document/invoice icon
- ⋮ Three-dot overflow menu

**Horizontal Sub-tab Bar (scrollable, 9 tabs total):**
Party | **Transaction** | Site | Task | Attendance | Material | MOM | Design | Files

**Financial Summary Row:**
| Metric | Value |
|--------|-------|
| BALANCE | +₹4,05,564 |
| TOTAL IN | ₹5,31,690 |
| TOTAL OUT | ₹1,26,126 |
| INVOICE | ₹0 |
| TOTAL EXPENSE | ₹750 |

**Filter Chips:**
- Request | Unbilled | Approvals

**Transaction List:** Each entry shows:
- Date + type (e.g., "20 Aug 24, Payment Out")
- Party name + category
- Amount (₹)

**Sample Transactions:**
| Date | Party | Category | Amount |
|------|-------|----------|--------|
| 20 Aug 24 | Others | Electrical | ₹800 |
| 20 Aug 24 | Others | Electrical | ₹270 |
| 21 Jul 24 | Manoj Carpenter | Carpenter | ₹20,000 |
| 14 Jul 24 | Manoj Carpenter | Carpenter Advance | ₹30,000 |
| 14 Jul 24 | Satender Pal Painter | Painting Advance | ₹5,000 |
| 14 Jul 24 | Vijay pop | — | ₹40,000 |

**Footer Actions:**
- 🟢 **Payment In** button
- ➕ FAB (add transaction)
- 🔴 **Payment Out** button

**Connects to:**
- → Transaction detail (via tapping an entry)
- → S11 Party Tab, S12 Site Tab, etc. (via sub-tabs)
- → Add payment flow (via Payment In / Payment Out)

---

### S11 — Project Detail: Party Tab

**Screen Type:** Project sub-screen (party/stakeholder list)  
**Accessed via:** Tapping "Party" sub-tab in Project Detail

**Layout & Elements:**

**Team Banner:**
- "1 Team Members" — shows team size
- **Manage Access >** link — control who can view/edit the project

**Financial Summary:**
- ADVANCE PAID: ₹1,26,126
- PENDING TO PAY: ₹750

**Controls:**
- 🔍 Search Party
- **Active** dropdown filter
- Sort icon (↑↓)

**Party Cards:** Each party shows:
- Colour-coded avatar with initials
- Name + role (Client / Vendor / Contractor)
- Amount (₹) + payment status (Advance Received / Advance Paid)

**Sample Project Parties (Titania D402):**
| Party | Role | Amount | Status |
|-------|------|--------|--------|
| PR Kartheek | Client | ₹5,31,690 | Advance Received |
| Vijay pop | Vendor | ₹40,000 | Advance Paid |
| Others | Vendor | ₹16,126 | Advance Paid |
| Satender Pal Painter | Contractor | ₹5,000 | Advance Paid |
| Prasad Hyd Electrician | Vendor | ₹15,000 | Advance Paid |

**Connects to:**
- → Party ledger detail (via party card tap)
- → Manage Access screen (via "Manage Access >")
- → Other project sub-tabs

---

### S12 — Project Detail: Site Tab

**Screen Type:** Project sub-screen (daily site activity)  
**Accessed via:** Tapping "Site" sub-tab in Project Detail

**Layout & Elements:**

**Progress Bar:**
- Progress: **20%** (linear bar)
- **Material Requests** link (shortcut to material section)

**Date Navigator:**
- < 11 Apr, Sat > — navigate between days

**Daily Summary Cards (3 cards):**
| Card | Value |
|------|-------|
| Site Staff (Present) | 0 |
| Material Received | 0 |
| Material Used | 0 |

**Site Photos Section:**
- "View All >" link
- Photo add placeholder (📷+) — add site photos for the day

**Ongoing Tasks Section:**
- "View All >" link
- Empty state: "No progress today"

**Footer:**
- 📋 **Create DPR** button (creates a Daily Progress Report for that date)

**Connects to:**
- → DPR creation flow (via "Create DPR")
- → Full photo gallery (via "View All" in Site Photos)
- → Task list (via "View All" in Ongoing Tasks → S13)
- → Material Requests (via link)

---

### S13 — Project Detail: Task Tab

**Screen Type:** Project sub-screen (task tracker)  
**Accessed via:** Tapping "Task" sub-tab in Project Detail

**Layout & Elements:**

**Status Summary Row:**
| Status | Count |
|--------|-------|
| NOT STARTED | 0 |
| ONGOING | 0 |
| PROGRESS | 20% |

**Filter Row:**
- 🔍 Search
- **Status** dropdown
- **Member** dropdown
- Sort: "As Schedule"

**Task Cards:** Each task shows:
- Task number + name
- Date range (start - end date)
- Last updated date
- Quantity progress (e.g., 20/100 yard)
- Completion status

**Sample Task (Titania D402):**
| Task | Dates | Progress | Status |
|------|-------|----------|--------|
| 1 — Xxx | 05 Aug – 06 Aug | 20/100 yard | Completed |

**Footer:**
- **+ Add New Task** button (full-width, purple)

**Connects to:**
- → Task detail / edit (via task card tap)
- → Add task flow (via "+ Add New Task")

---

### S14 — Project Detail: Attendance Tab

**Screen Type:** Project sub-screen (staff attendance)  
**Accessed via:** Tapping "Attendance" sub-tab in Project Detail

**Layout & Elements:**

**Sub-tabs (3 types):**
- **All** (active) | Site Staff | Labour Contractor

**Date Navigator:**
- Calendar icon with date: 11 Apr (current date)
- < > navigation arrows

**Daily Attendance Summary:**
- **0 Present** + Share icon (📤)
- ■ 0 Absent ■ 0/0 PL/WO (Paid Leave / Week Off)

**Staff List Controls:**
- **Active (1)** dropdown — filter active staff
- **+ Add Site Staff** button

**Staff Attendance Cards:** Each entry shows:
- Staff avatar with initials
- Name + location (e.g., "Dinesh @ Ganesh Shop >")
- **Present** / **Absent** buttons (toggle)
- Dropdown arrow for additional status options

**Connects to:**
- → Staff profile (via staff name tap)
- → Add staff form (via "+ Add Site Staff")

---

### S15 — Project Detail: Material Tab

**Screen Type:** Project sub-screen (material management)  
**Accessed via:** Tapping "Material" sub-tab in Project Detail

**Layout & Elements:**

**Sub-tabs (4 views):**
- **Inventory** (active) | Request | Received | Used

**Controls:**
- 🔍 Search
- **+ Add Material** button

**Content Area:**
- Empty state: "No Material received in Project."

**Footer Actions:**
- 🟣 **+ Request** button
- ➕ FAB (center)
- 🟢 **+ Received** button

**Connects to:**
- → Material request form (via "+ Request")
- → Record received material (via "+ Received")
- → Add to inventory (via "+ Add Material")

---

### S16 — Project Detail: MOM Tab

**Screen Type:** Project sub-screen (Minutes of Meeting)  
**Accessed via:** Tapping "MOM" sub-tab in Project Detail

**Layout & Elements:**

**Filter Row:**
- 🔍 Search
- **All** dropdown
- **Attendee** dropdown

**Content Area:**
- Empty state: "No MOM created"

**Footer:**
- **+ New MOM** button (full-width, purple)

**Connects to:**
- → MOM detail view (via tapping a MOM entry)
- → New MOM creation form (via "+ New MOM")

---

### S17 — Project Detail: Design Tab

**Screen Type:** Project sub-screen (design files)  
**Accessed via:** Tapping "Design" sub-tab in Project Detail

**Layout & Elements:**

**Sub-tabs (3 design types):**
- **2D Layout** (active) | 3D Layout | Production Files

**Controls:**
- 🔍 Search

**Content Area:**
- Empty state: "No Design created in Project."

**Connects to:**
- → Design file viewer (via tapping a design item)
- → Upload/create design (via FAB or add button)

---

### S18 — Project Detail: Files Tab

**Screen Type:** Project sub-screen (document storage)  
**Accessed via:** Tapping "Files" sub-tab in Project Detail

**Layout & Elements:**

**Site Photos Section:**
- "View All >" link
- Photo add placeholder icon (📷+)

**Folders Section:**
- Empty state: "No Folders added — Add files in this folder"

**Footer:**
- **New Folder** button (full-width, purple)

**Connects to:**
- → File/folder viewer (via tapping a folder)
- → Create new folder (via "New Folder")
- → Photo gallery (via "View All")

---

## 4. Screen Connection Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         APP LAUNCH                                  │
│                      [S1 — Splash Screen]                           │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ (auto-navigates after load)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│              [S2 — Projects Dashboard / Home]                       │
│  ┌──────────────┬─────────────┬─────────────┬──────────────────┐   │
│  │  Hamburger   │  Upgrade    │  Project    │  Notification    │   │
│  │  Menu (☰)   │  Now Banner │  Card (tap) │  Bell (🔔)       │   │
│  └──────┬───────┴──────┬──────┴──────┬──────┴──────────────────┘   │
└─────────┼──────────────┼─────────────┼──────────────────────────────┘
          │              │             │
          ▼              ▼             ▼
    [S3 Sidebar]   [S7 Pricing]   ┌─────────────────────────────────────┐
                                  │  [S10–S18 — Project Detail]          │
                                  │  Horizontal scrollable tab bar:      │
                                  │                                      │
                                  │  S11       S10          S12          │
                                  │  Party → Transaction ← Site          │
                                  │              ↑                       │
                                  │  S13       (hub)        S14          │
                                  │  Task  →   MOM   ←  Attendance       │
                                  │              ↑                       │
                                  │  S15       S16          S17          │
                                  │ Material→  MOM   ←   Design          │
                                  │              ↑                       │
                                  │            S18                       │
                                  │           Files                      │
                                  └─────────────────────────────────────┘

Bottom Tab Bar (always visible from S2, S4, S6, S8):
┌────────────┬────────────┬────────────┬────────────┐
│            │            │            │            │
│   [S4]     │   [S2]     │   [S6]     │   [S8]     │
│ Quotation  │ Projects   │  Parties   │   Chats    │
│   List     │ Dashboard  │   List     │   Groups   │
│    │       │            │    │       │    │       │
│    ▼       │            │    ▼       │    ▼       │
│   [S5]     │            │  [S7]      │   [S9]     │
│ Quotation  │            │ Paywall    │   Chat     │
│  Detail    │            │ (Upgrade)  │   Conv.    │
└────────────┴────────────┴────────────┴────────────┘

Sidebar [S3] connects to:
  → Home (S2)
  → Roles & Access
  → Payroll People
  → Master Library
  → Company Settings
  → Business Card
  → Invite Friends
  → Customer Support
  → Backup
  → Give Feedback
  → Logout
```

---

## 5. Feature Summary by Module

### Quotations Module
- Create, view, and manage client quotations
- Itemised line items grouped by room/category
- Status workflow: Draft → In Discussion → (Approved / Rejected)
- Export and share quotations with clients (PDF/share sheet)

### Projects Module
- Multi-project dashboard with financial overview (In/Out per project)
- Per-project progress tracking (percentage)
- 9-tab deep project detail covering all aspects of site management

### Parties Module
- Centralised contact list: clients, vendors, workers, suppliers
- Financial balance tracking per party
- Party type categorisation
- *(Detail view requires Business plan upgrade)*

### Chats Module
- Internal team communication via group chat
- "Onsite Announcements" system channel included by default
- Create custom groups
- Standard messaging UI (WhatsApp-style)

### Site Management (within Project)
- Day-wise site summary (staff present, materials in/out)
- Photo documentation per day
- Daily Progress Report (DPR) creation

### Attendance (within Project)
- Track daily attendance for Site Staff and Labour Contractors
- Present / Absent / PL / WO status
- Date navigation to review history

### Material Management (within Project)
- Inventory, Request, Received, and Used views
- Material request workflow
- Track what's been ordered vs. received vs. consumed

### Task Management (within Project)
- Task creation with start/end dates
- Progress tracking by quantity (e.g., yards, units)
- Status: Not Started / Ongoing / Completed
- Filter by status and member

### Finance (within Project — Transaction Tab)
- Full ledger of payments in and out
- Payment In and Payment Out entry
- Invoice and expense tracking
- Balance calculation

### Design (within Project)
- 2D Layout, 3D Layout, and Production Files storage
- Organise design assets per project

### Files (within Project)
- Document/file storage per project
- Folder organisation
- Site photo management

---

## 6. Monetisation & Access Control

The Onsite app uses a **freemium model** with the following structure:

### Free Tier
- Basic project management
- Quotation creation
- Party list view (no detail drill-down)
- Basic site and task tracking

### Business Plan — ₹36,000/Year + GST (3 users)
- Bill of Quantity (BOQ) & RA Bills
- Budget Control
- Central Warehouse
- Purchase Orders
- Assets & Tools
- Equipment & Machinery
- Full Party detail access

### Business Plus Plan — ₹45,000/Year + GST (3 users) ⭐ Popular
- All Business features
- Additional advanced features (implied from pricing tier)

### Paywall Trigger Points
- Tapping any Party card in the Parties tab → opens S7 Upgrade screen
- "Upgrade Now" banner on the main dashboard → opens S7 Upgrade screen

### Contact-based Purchase
- No in-app purchase button observed; users must tap **"Contact Us"** to initiate subscription, suggesting a sales-assisted model.

---

## 7. Key Observations & Insights

**Strengths:**

1. **Comprehensive coverage** — Onsite covers nearly every aspect of a construction/interior design project in a single app: finance, site, tasks, team, materials, documents, and design files.

2. **Clean financial summaries** — Every list (projects, parties, transactions) shows real-time financial context (In/Out balances), making it easy to spot financial health at a glance.

3. **Deep project organisation** — The 9-tab project detail structure is well-thought-out and mirrors real-world project workflows (plan → execute → track → close).

4. **Quotation workflow** — The quotation module with itemised categories and status stages is particularly useful for interior designers who regularly send proposals to clients.

5. **Persistent bottom nav** — The 4-tab bottom bar is always accessible, enabling quick switching between core workflows without losing context.

**Observations:**

6. **Paywall placement** — Placing the paywall behind party detail taps (rather than a dedicated upgrade screen) may cause friction or confusion for new users who don't immediately understand why a feature is locked.

7. **DPR shortcut** — The Daily Progress Report is featured prominently as a quick shortcut on the home screen, indicating it's a high-frequency action for site managers.

8. **Camera restriction** — Using the app via iPhone Mirroring blocks camera access (expected system behaviour), which affects photo features within the app.

9. **App version 14.8.2** — The high version number suggests a mature, actively maintained product with a long release history.

10. **Backup feature** — Timestamped backup (5:40 AM, 11 Apr) shown in the sidebar indicates automatic daily backups, which is a strong trust-builder for SME users storing business data.

---

*Report generated by AI analysis of live app screens via iPhone Mirroring on April 11, 2026.*

---

## 8. UI Design System & Component Analysis

### 8.1 Colour Palette

| Colour | Usage |
|--------|-------|
| **Primary Purple** `#6C63FF` (approx.) | Buttons, active tab indicators, section headers, FABs |
| **Red / Coral** `#E84B4B` (approx.) | Splash screen brand colour; Payment Out button; negative balances |
| **Green** | Payment In button; positive balance indicators |
| **Gold / Yellow** | Coin icon on Parties; "Upgrade Now" banner crown icon |
| **Light Grey** | Card backgrounds, form field fills |
| **White** | Screen backgrounds, card surfaces |
| **Dark Navy** `#1A1A2E` | Primary text |
| **Medium Grey** | Placeholder text, secondary labels |

### 8.2 Typography

- **Headers / Titles:** Bold, ~18–20pt — screen titles ("Payment In", "Titania D402")
- **Section Labels:** Semi-bold, ~14pt — tab names, field labels
- **Body / Data:** Regular, ~13–14pt — amounts, party names, descriptions
- **Small / Meta:** Regular, ~11–12pt — dates, location subtitles, status badges
- **Amount Text (In):** Green, bold — positive financial figures
- **Amount Text (Out):** Red/coral, bold — negative financial figures

### 8.3 Navigation Components

**Bottom Tab Bar:**
- 4 fixed tabs: Quotation | Projects | Parties | Chats
- Active tab: icon fills with primary purple + label turns purple
- Inactive tab: grey icon + grey label
- No badge/notification count shown on tabs

**Horizontal Scrollable Sub-Tab Bar (Project Detail):**
- Tabs scroll horizontally to reveal 9 tabs
- Active tab: underlined in purple + bold label
- Visible tabs at once: ~4–5 depending on label length
- Tab order: Party → Transaction → Site → Task → Attendance → Material → MOM → Design → Files

**Back Navigation:**
- Persistent `<` (chevron left) in top-left of every sub-screen
- Returns to the immediate parent screen

**Header Bar (Standard):**
```
[☰ Menu]  [Company Name ↑↓]     [🔔 Bell]  [🖥 Desktop]
```
- Appears on all 4 main tab screens
- Menu opens left drawer
- Bell opens notifications
- ↑↓ icon opens sort/filter for company switching

### 8.4 Card & List Components

**Project Card:**
```
┌─────────────────────────────────────────┐
│ Project Name                    XX%  ⋮  │
│ Location, Location                       │
│ ₹ X,XX,XXX In       ₹ X,XX,XXX Out  >  │
└─────────────────────────────────────────┘
```
- Full-width, white background, 1px border or shadow
- Progress % shown top-right in grey
- ⋮ opens context menu (Edit / Archive / Delete)
- > chevron indicates drill-down

**Quotation Card:**
```
┌─────────────────────────────────────────┐
│ Quotation Name                       ⋮  │
│ Client Name                             │
│ ₹ Amount                    [Status ▼] │
└─────────────────────────────────────────┘
```
- Status badge is a colour-coded pill dropdown

**Party Card:**
```
┌─────────────────────────────────────────┐
│ Party Name                  ₹ Amount    │
│ Party Type                  Status      │
└─────────────────────────────────────────┘
```

**Transaction Entry (in Project):**
```
┌─────────────────────────────────────────┐
│ [🔴] DD Mon YY, Payment Out    ₹ X,XXX │
│      Party Name                         │
│      Category / Description             │
└─────────────────────────────────────────┘
```
- Red circle = Payment Out; Green circle = Payment In

### 8.5 Status Badges

| Badge | Colour | Meaning |
|-------|--------|---------|
| Draft | Yellow/Amber pill | Quotation not yet sent |
| In Discussion | Blue/Teal pill | Shared with client, pending response |
| Advance Paid | Green text | Party has received advance |
| Settled | Grey text | Party account fully settled |
| Completed | Purple badge | Task fully completed |
| Start | Purple outline button | Task not yet started — tap to begin |

### 8.6 Button Styles

| Button Type | Style | Usage |
|-------------|-------|-------|
| **Primary CTA** | Full-width, solid purple, white text, rounded | Create/Save forms |
| **Payment In** | Full-width half, solid green | Add payment received |
| **Payment Out** | Full-width half, solid red/coral | Record money sent out |
| **FAB (+)** | Circular, solid purple, centre between two buttons | Quick add in Project |
| **Upgrade Now** | Golden outline, crown icon, amber background | Prompts subscription |
| **Desktop Link** | Outline, monitor icon | Opens desktop web version |
| **Save & New** | Outline (secondary), white bg | Save and open blank form again |
| **Save** | Solid purple | Save and close form |
| **+ New [X]** | Text link, top-right of list | Open creation form |

### 8.7 Form Input Components

| Component | Appearance | Usage |
|-----------|------------|-------|
| **Text Field** | Light grey fill, floating label, rounded corners | Names, descriptions, amounts |
| **Date Picker** | Calendar icon right-aligned, text input style | Dates throughout |
| **Dropdown** | Chevron (∨) on right, pill or full-width | Party type, cost code, status |
| **Radio Group** | Horizontal row of labelled radio buttons | Payment method selection |
| **Toggle Switch** | iOS-style pill toggle | Item Level Tax, feature toggles |
| **Country Code + Phone** | Flag + code dropdown + number input, side by side | Phone number in Party form |
| **Photo Upload** | Dashed border placeholder with camera icon | Site photos, attachments |
| **Party Selector** | People icon + "From/To Party" + asterisk | Party search/select field |

---

## 9. All Forms — Field Reference

### F1 — Create Project

**Triggered by:** "+ Project" button on Projects Dashboard  
**Type:** Full screen form

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Project Image | Image upload | No | Empty placeholder | Square logo/thumbnail |
| Project Name | Text input | Yes* | — | Primary identifier |
| Project Address | Text input | No | — | Site location |
| Start Date | Date picker | No | — | Project kick-off date |
| End Date | Date picker | No | — | Expected completion |
| Attendance Radius (m) | Number input | No | **500** | Geo-fence radius for site attendance check-in |
| Project Value | Number input | No | — | Total contract value in ₹ |

**Actions:** Create Project (primary button)

---

### F2 — Create New Quotation

**Triggered by:** "+ New Quotation" on Quotation List  
**Type:** Bottom sheet modal

| Field | Type | Required | Validation Message | Notes |
|-------|------|----------|--------------------|-------|
| Quotation Name | Text input | **YES** | *"Quotation name should not be blank"* | Highlighted red on empty submit |
| Client | Party selector | No | — | Links quotation to a party |
| Item Level Tax | Toggle | No | — | Default: **ON** (enabled) |

**Actions:** Create Quotation (purple, full-width)

---

### F3 — Add Item to Quotation

**Triggered by:** "+ Add Item" button inside a Quotation  
**Type:** Dropdown menu / sub-form

Items are grouped by **Room/Category**. Each line item contains:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Room/Category Name | Text / Dropdown | Yes* | Groups items (TV Unit, Kitchen, etc.) |
| Item/Material Name | Text input | Yes* | Material description |
| Unit | Dropdown | No | Sq.ft, Nos, Running ft, etc. |
| Quantity | Number input | No | Amount of material |
| Rate (₹) | Number input | No | Price per unit |
| Amount (₹) | Auto-calculated | — | Qty × Rate |

---

### F4 — Payment In

**Triggered by:** "Payment In" button on Project Transaction tab  
**Type:** Full screen form

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Date | Date picker (dropdown) | Yes | Today's date | Format: DD-MM-YY |
| From Party | Party selector | **YES** *(asterisk)* | — | Who paid money to the project |
| Amount Received | Number input | Yes* | — | Amount in ₹ |
| Description | Text input | No | — | Note about the payment |
| Reference Number | Text input | No | — | Cheque no., UTR, transaction ID |
| Payment Method | Radio group | No | None selected | **Cash** / **Bank Transfer** / **Cheque** |
| Cost Code | Dropdown | No | — | Internal accounting code |
| Add More Detail | Expandable section | — | — | Expands to reveal additional fields |

**Footer Actions:** 📷 Camera (attach photo) | 🔼 Upload | **Save**

---

### F5 — Payment Out

**Triggered by:** "Payment Out" button on Project Transaction tab  
**Type:** Full screen form

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Date | Date picker (dropdown) | Yes | Today's date | Format: DD-MM-YY |
| To Party | Party selector | **YES** *(asterisk)* | — | Who received the payment |
| Amount Given | Number input | Yes* | — | Amount in ₹ |
| Description | Text input | No | — | What the payment was for |
| Reference Number | Text input | No | — | Cheque no., UTR, transaction ID |
| Payment Method | Radio group | No | None selected | **Cash** / **Bank Transfer** / **Cheque** |
| Cost Code | Dropdown | No | — | Internal accounting code |
| Add More Detail | Expandable section | — | — | Expands to reveal additional fields |

**Footer Actions:** 📷 Camera (attach photo) | 🔼 Upload | **Save**

> **Payment In vs Payment Out comparison:** The two forms are nearly identical in structure. The only differences are: (1) the title, (2) the party field label ("From Party" vs "To Party"), and (3) the amount field label ("Amount Received" vs "Amount Given").

---

### F6 — Add New Task

**Triggered by:** "+ Add New Task" on Project Task tab  
**Type:** Full screen form

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Description | Text input | No | — | Task name/description (focused by default) |
| Duration (Days) | Number input | **YES** *(asterisk)* | — | How many days the task takes |
| Start Date | Date picker | No | — | Calendar icon, side-by-side with End Date |
| End Date | Date picker | No | — | Calendar icon |
| Progress Unit | Dropdown | **YES** *(asterisk)* | **%** | Unit for measuring progress (%, sq.ft, nos, etc.) |
| Est. Quantity | Number input | **YES** *(asterisk)* | **100** | Target quantity to complete |
| Assignee | People selector | No | — | Team member assigned to this task |
| Attachments | File/image upload | No | — | Supporting documents or images |

**Footer Actions:** **Save & New** (secondary) | **Save** (primary purple)

---

### F7 — Create New Party

**Triggered by:** "+ New Party" on Parties List  
**Type:** Full screen form

**Step 1 — Party Type Selection (bottom sheet picker):**

| Party Type | Category |
|-----------|----------|
| Client | Individual |
| Staff | Individual |
| Worker | Individual |
| Investor | Individual |
| Material Supplier | Vendor |
| Labour Contractor | Vendor |

**Step 2 — Party Details Form (fields shown vary by type):**

| Field | Type | Required | Notes | Shown For |
|-------|------|----------|-------|-----------|
| Party Type | Dropdown | **YES** | Auto-set from Step 1, changeable | All types |
| Party Id | Number (auto-gen) | — | Auto-incremented, editable via ✏️ | All types |
| Party Name | Text input | Yes* | Primary name field | All types |
| Phone Number | Country code + Number | No | +91 (India) default, flag selector | All types |
| Email | Email input | No | — | All types |
| Father Name | Text input | No | — | Staff / Worker |
| Date of Joining | Date picker | No | Calendar icon | Staff / Worker |
| Address | Text area | No | Multi-line | All types |
| **Additional Fields** | | | | |
| Aadhar Number | Text input | No | — | Staff / Worker |
| Aadhar Document | File upload | No | Upload button beside Aadhar field | Staff / Worker |

**Footer Actions:** **Save**

---

### F8 — Transaction Filter Panel

**Triggered by:** Filter icon (≡) on Project Transaction tab  
**Type:** Right-side slide-in panel

| Filter Category | Options |
|----------------|---------|
| **Transaction Type** | All / Payment In / Payment Out / Material Purchase / Material Return / Other Expense / Party Payment |
| **Category** | (Work categories, e.g., Electrical, Carpentry) |
| **Entry By** | Team member who recorded the transaction |
| **Party** | Filter by specific party |
| **Cost Code** | Filter by cost code |
| **Date** | Date range picker |
| **Mode of Payment** | Cash / Bank Transfer / Cheque |

**Actions:** Clear Filter | **VIEW RESULT**

---

### F9 — Add New MOM (Minutes of Meeting)

**Triggered by:** "+ New MOM" on Project MOM tab  
**Type:** Full screen form *(structure inferred from similar forms)*

Expected fields (based on app patterns):
- Date (date picker)
- Title / Subject
- Attendees (multi-select party picker)
- Meeting Notes / Description
- Action Items
- Attachments

---

### F10 — New Chat Group

**Triggered by:** ➕ FAB on Chat Groups screen  
**Type:** Modal or full screen

Expected fields:
- Group Name
- Add Members (multi-select from team)

---

## 10. UI Interaction Patterns

### 10.1 Form Validation Behaviour
- **Inline error messages** appear immediately below the invalid field in red text on submit attempt
- **Red field border** highlights the problem field
- Example: *"Quotation name should not be blank"* under the Quotation Name field
- No modal error pop-ups — all validation is inline

### 10.2 Bottom Sheet Pattern
Some creation forms (e.g., New Quotation, Party Type picker) use **bottom sheets** — a sheet that slides up from the bottom of the screen over the current content. These are used for:
- Quick creation with minimal fields
- Selecting from a list of options (like Party Type)
- Dismissed by tapping the dimmed area behind, or swiping down

### 10.3 Expandable Sections
- Payment forms use **"Add More Detail +"** expandable sections
- These hide optional/advanced fields to reduce form complexity
- Users can reveal them by tapping the `+` button

### 10.4 Floating Action Button (FAB)
- Purple circular `+` button floats above the bottom action bar in Project Transaction tab
- Positioned centrally between "Payment In" and "Payment Out"
- Provides quick-add access to a broader transaction type selection

### 10.5 Loading & Empty States
- **Loading:** Blue circular spinner (thin ring) centred on screen
- **Empty list:** Centred text message, e.g., "No Material received in Project.", "No MOM created", "No Folders added"
- **Empty state actions:** Footer button always available even when list is empty (e.g., "+ New MOM", "New Folder")

### 10.6 Toggle Switches
- iOS-native style pill toggles
- Purple when ON, grey when OFF
- "Item Level Tax" toggle in Quotation form is ON by default

### 10.7 Date Pickers
- Calendar icon (📅) is the trigger
- Appears as iOS native date wheel or calendar popup
- Used in: Project dates, Task dates, Payment dates, Party joining date

### 10.8 Auto-Generated Fields
- **Party Id:** Auto-increments from existing count (e.g., "4" shown for next party)
- **Quotation Number:** Auto-increments (e.g., #19 for Sri Laxmi quotation)
- Both are editable via the ✏️ edit icon if user wants a custom value

---

## 11. Complete Project List (Observed)

During analysis, the following projects were visible across sessions:

| Project | Location | Progress | Balance Status |
|---------|----------|----------|----------------|
| Dr. Mounika | Kukatpally | 0% | +₹14,99,97,450 |
| Sai Krishna | Borabanda | 0% | ₹0 |
| Titania D402 | Kondapur | 20% | +₹4,05,564 |
| Kishore Hallmark B206 | Hyderabad/Narsing | — | -₹15,302 |
| Muralidhar Reddy 401 | Miyapur | 4% | — |
| Regina Skyon 1105 | Bachupally | 16% | -₹68,746 |
| Sumit 201 (Livi Space) | Hafeezpet | 0% | -₹894 |
| Crystal 1306 | Kondapur | 0% | -₹2,39,338 |
| Rama Devi Miyapur | Miyapur | 0% | -₹1,29,295 |
| Happy Office | — | 0% | — |

> **Note:** Several projects show negative balances (more paid out than received), which is common in construction where expenses are paid before client payments arrive.

---

*Report updated with UI analysis, form field documentation, and interaction patterns — April 11, 2026.*

---

# PART B — Technical Specification for Claude Code

> This section translates the UI/UX analysis into a full technical blueprint. It covers the database schema, API function specifications, business logic rules, authentication flow, state management, and recommended tech stack. Feed this entire document to Claude Code to build a functionally equivalent app.

---

## 12. Is This Report Enough for Claude Code?

### What the report already covers ✅
- All screens, their layouts, and UI components
- Navigation structure and screen connections
- Every form with all field names, types, and required markers
- Status workflows and badge states
- Business feature modules

### What Claude Code additionally needs ❌ → Added below
- **Database schema** — tables, columns, data types, foreign keys
- **API / function specifications** — what each button/action calls
- **Business logic rules** — calculations, validations, workflows
- **Authentication & multi-tenancy** — login, company accounts, roles
- **State management** — what lives where in the app's memory
- **Tech stack recommendation** — which frameworks to use

---

## 13. Recommended Tech Stack

### Mobile App (React Native — recommended for iOS + Android from one codebase)

| Layer | Technology | Reason |
|-------|-----------|--------|
| **Framework** | React Native (Expo) | Cross-platform iOS + Android, fast dev |
| **Language** | TypeScript | Type safety, fewer runtime bugs |
| **Navigation** | React Navigation v6 | Bottom tabs + stack + drawer |
| **State Management** | Zustand + React Query | Lightweight global state + server-sync |
| **UI Components** | React Native Paper or NativeWind | Material-style or Tailwind-style |
| **Forms** | React Hook Form + Zod | Validation, minimal re-renders |
| **Charts** | Victory Native | Financial summaries |

### Backend (Node.js REST API)

| Layer | Technology | Reason |
|-------|-----------|--------|
| **Runtime** | Node.js + Express | Fast, JavaScript throughout |
| **Language** | TypeScript | Type safety |
| **Database** | PostgreSQL | Relational data, financial integrity |
| **ORM** | Prisma | Type-safe DB queries, migrations |
| **Auth** | JWT + bcrypt | Token-based, stateless |
| **File Storage** | AWS S3 or Cloudflare R2 | Photos, Aadhar docs, design files |
| **Push Notifications** | Firebase FCM | Approvals, task updates |

### Alternative: Firebase-only (faster MVP)
- Firestore for database
- Firebase Auth for authentication
- Firebase Storage for files
- Cloud Functions for business logic

---

## 14. Database Schema

### Multi-Tenancy Model
The app is **multi-tenant**: each company (e.g., "Happy Interior") is a separate organisation. All data is scoped to a `company_id`.

```
COMPANY → has many → USERS
COMPANY → has many → PROJECTS
COMPANY → has many → PARTIES
COMPANY → has many → QUOTATIONS
```

---

### Table 1: `companies`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `name` | VARCHAR(255) | ✅ | e.g., "Happy Interior" |
| `logo_url` | TEXT | ❌ | Company logo image |
| `plan` | ENUM('free','business','business_plus') | ✅ | Subscription tier |
| `plan_expires_at` | TIMESTAMP | ❌ | Subscription expiry |
| `backup_last_at` | TIMESTAMP | ❌ | Last auto-backup timestamp |
| `created_at` | TIMESTAMP | ✅ | Auto |
| `updated_at` | TIMESTAMP | ✅ | Auto |

---

### Table 2: `users`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `company_id` | UUID | ✅ FK → companies | |
| `name` | VARCHAR(255) | ✅ | |
| `email` | VARCHAR(255) | ✅ | Unique per company |
| `phone` | VARCHAR(20) | ❌ | |
| `password_hash` | TEXT | ✅ | bcrypt |
| `role` | ENUM('owner','admin','member','viewer') | ✅ | Access control |
| `is_active` | BOOLEAN | ✅ | Default true |
| `created_at` | TIMESTAMP | ✅ | Auto |

---

### Table 3: `projects`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `company_id` | UUID | ✅ FK → companies | |
| `name` | VARCHAR(255) | ✅ | e.g., "Titania D402" |
| `address` | TEXT | ❌ | Site address |
| `city` | VARCHAR(100) | ❌ | Parsed city for display |
| `start_date` | DATE | ❌ | |
| `end_date` | DATE | ❌ | |
| `project_value` | DECIMAL(15,2) | ❌ | Total contract value ₹ |
| `attendance_radius_m` | INTEGER | ✅ | Default: 500 metres |
| `thumbnail_url` | TEXT | ❌ | Project image |
| `progress_percent` | DECIMAL(5,2) | ✅ | Computed or manual, default 0 |
| `status` | ENUM('active','completed','archived') | ✅ | Default: active |
| `created_by` | UUID | ✅ FK → users | |
| `created_at` | TIMESTAMP | ✅ | Auto |
| `updated_at` | TIMESTAMP | ✅ | Auto |

---

### Table 4: `project_members`
*(Who has access to each project)*

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `project_id` | UUID | ✅ FK → projects | |
| `user_id` | UUID | ✅ FK → users | |
| `role` | ENUM('owner','editor','viewer') | ✅ | Project-level permission |
| `joined_at` | TIMESTAMP | ✅ | Auto |

---

### Table 5: `parties`
*(Clients, vendors, workers, staff — all in one table)*

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `company_id` | UUID | ✅ FK → companies | |
| `party_ref_id` | INTEGER | ✅ | Auto-incremented display ID (e.g., "4") |
| `name` | VARCHAR(255) | ✅ | Party full name |
| `type` | ENUM('client','staff','worker','investor','material_supplier','labour_contractor') | ✅ | |
| `phone` | VARCHAR(20) | ❌ | |
| `phone_country_code` | VARCHAR(10) | ❌ | Default: "+91" |
| `email` | VARCHAR(255) | ❌ | |
| `father_name` | VARCHAR(255) | ❌ | For staff/worker only |
| `date_of_joining` | DATE | ❌ | For staff/worker only |
| `address` | TEXT | ❌ | |
| `aadhar_number` | VARCHAR(20) | ❌ | Encrypted at rest |
| `aadhar_doc_url` | TEXT | ❌ | S3 URL of uploaded document |
| `is_active` | BOOLEAN | ✅ | Default true |
| `created_by` | UUID | ✅ FK → users | |
| `created_at` | TIMESTAMP | ✅ | Auto |

---

### Table 6: `party_project_balances`
*(Running financial balance per party per project)*

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `party_id` | UUID | ✅ FK → parties | |
| `project_id` | UUID | ✅ FK → projects | |
| `total_in` | DECIMAL(15,2) | ✅ | Default 0 — money received FROM party |
| `total_out` | DECIMAL(15,2) | ✅ | Default 0 — money paid TO party |
| `balance` | DECIMAL(15,2) | ✅ | Computed: total_in - total_out |
| `updated_at` | TIMESTAMP | ✅ | Auto |

---

### Table 7: `transactions`
*(All money movements in a project)*

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `project_id` | UUID | ✅ FK → projects | |
| `company_id` | UUID | ✅ FK → companies | |
| `type` | ENUM('payment_in','payment_out','material_purchase','material_return','other_expense','party_payment') | ✅ | Transaction type |
| `party_id` | UUID | ❌ FK → parties | The other party |
| `amount` | DECIMAL(15,2) | ✅ | In ₹ |
| `description` | TEXT | ❌ | Narration |
| `reference_number` | VARCHAR(100) | ❌ | Cheque/UTR/transaction ID |
| `payment_method` | ENUM('cash','bank_transfer','cheque') | ❌ | |
| `cost_code` | VARCHAR(50) | ❌ | Internal accounting code |
| `category` | VARCHAR(100) | ❌ | e.g., "Electrical", "Carpentry" |
| `transaction_date` | DATE | ✅ | User-selected date |
| `attachment_urls` | JSONB | ❌ | Array of photo/doc URLs |
| `is_billed` | BOOLEAN | ✅ | Default false — for "Unbilled" filter |
| `needs_approval` | BOOLEAN | ✅ | Default false |
| `approved_by` | UUID | ❌ FK → users | |
| `entered_by` | UUID | ✅ FK → users | |
| `created_at` | TIMESTAMP | ✅ | Auto |

---

### Table 8: `quotations`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `company_id` | UUID | ✅ FK → companies | |
| `quotation_ref_id` | INTEGER | ✅ | Auto-incremented display ID (e.g., #19) |
| `name` | VARCHAR(255) | ✅ | Quotation label (e.g., "Raju") |
| `client_party_id` | UUID | ❌ FK → parties | Linked client |
| `quotation_date` | DATE | ✅ | Default: today |
| `status` | ENUM('draft','in_discussion','approved','rejected','converted') | ✅ | Default: draft |
| `item_level_tax` | BOOLEAN | ✅ | Default true |
| `tax_percent` | DECIMAL(5,2) | ❌ | GST % if applicable |
| `round_off` | BOOLEAN | ✅ | Default false |
| `total_amount` | DECIMAL(15,2) | ✅ | Computed from items |
| `created_by` | UUID | ✅ FK → users | |
| `created_at` | TIMESTAMP | ✅ | Auto |
| `updated_at` | TIMESTAMP | ✅ | Auto |

---

### Table 9: `quotation_categories`
*(Room/space groupings within a quotation)*

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `quotation_id` | UUID | ✅ FK → quotations | |
| `name` | VARCHAR(255) | ✅ | e.g., "TV Unit", "Kitchen" |
| `sort_order` | INTEGER | ✅ | Display order |
| `subtotal` | DECIMAL(15,2) | ✅ | Computed |

---

### Table 10: `quotation_items`
*(Individual line items within a category)*

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `category_id` | UUID | ✅ FK → quotation_categories | |
| `quotation_id` | UUID | ✅ FK → quotations | For quick queries |
| `description` | TEXT | ✅ | Material/item name |
| `unit` | VARCHAR(50) | ❌ | sq.ft, nos, running ft |
| `quantity` | DECIMAL(10,2) | ❌ | |
| `rate` | DECIMAL(15,2) | ❌ | Per unit price |
| `amount` | DECIMAL(15,2) | ✅ | qty × rate (or manual) |
| `tax_percent` | DECIMAL(5,2) | ❌ | Item-level tax if enabled |
| `sort_order` | INTEGER | ✅ | |

---

### Table 11: `tasks`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `project_id` | UUID | ✅ FK → projects | |
| `task_number` | INTEGER | ✅ | Auto-increment per project (1, 2, 3…) |
| `description` | TEXT | ❌ | Task name |
| `duration_days` | INTEGER | ✅ | Duration field from form |
| `start_date` | DATE | ❌ | |
| `end_date` | DATE | ❌ | |
| `progress_unit` | VARCHAR(20) | ✅ | Default "%" — also sq.ft, nos, etc. |
| `estimated_quantity` | DECIMAL(10,2) | ✅ | Default 100 |
| `completed_quantity` | DECIMAL(10,2) | ✅ | Default 0 |
| `progress_percent` | DECIMAL(5,2) | ✅ | Computed: (completed/estimated)×100 |
| `status` | ENUM('not_started','ongoing','completed') | ✅ | Default: not_started |
| `assignee_id` | UUID | ❌ FK → users | |
| `attachment_urls` | JSONB | ❌ | Array of file URLs |
| `last_updated_at` | TIMESTAMP | ✅ | Auto |
| `created_by` | UUID | ✅ FK → users | |
| `created_at` | TIMESTAMP | ✅ | Auto |

---

### Table 12: `attendance_records`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `project_id` | UUID | ✅ FK → projects | |
| `party_id` | UUID | ✅ FK → parties | Staff or Labour Contractor |
| `date` | DATE | ✅ | Attendance date |
| `status` | ENUM('present','absent','paid_leave','week_off') | ✅ | |
| `marked_by` | UUID | ✅ FK → users | |
| `created_at` | TIMESTAMP | ✅ | Auto |

**Unique constraint:** `(project_id, party_id, date)` — one record per person per day.

---

### Table 13: `site_photos`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `project_id` | UUID | ✅ FK → projects | |
| `photo_url` | TEXT | ✅ | S3/R2 file URL |
| `taken_date` | DATE | ✅ | Date the photo was for |
| `caption` | TEXT | ❌ | |
| `uploaded_by` | UUID | ✅ FK → users | |
| `created_at` | TIMESTAMP | ✅ | Auto |

---

### Table 14: `materials`
*(Inventory items tracked per project)*

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `project_id` | UUID | ✅ FK → projects | |
| `name` | VARCHAR(255) | ✅ | Material name |
| `unit` | VARCHAR(50) | ❌ | kg, sq.ft, bags, nos |
| `requested_qty` | DECIMAL(10,2) | ✅ | Default 0 |
| `received_qty` | DECIMAL(10,2) | ✅ | Default 0 |
| `used_qty` | DECIMAL(10,2) | ✅ | Default 0 |
| `in_stock_qty` | DECIMAL(10,2) | ✅ | Computed: received - used |
| `requested_by` | UUID | ❌ FK → users | |
| `created_at` | TIMESTAMP | ✅ | Auto |

---

### Table 15: `material_requests`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `project_id` | UUID | ✅ FK → projects | |
| `material_id` | UUID | ✅ FK → materials | |
| `requested_qty` | DECIMAL(10,2) | ✅ | |
| `status` | ENUM('pending','approved','rejected','received') | ✅ | Default: pending |
| `requested_by` | UUID | ✅ FK → users | |
| `approved_by` | UUID | ❌ FK → users | |
| `requested_at` | TIMESTAMP | ✅ | Auto |
| `approved_at` | TIMESTAMP | ❌ | |

---

### Table 16: `daily_progress_reports` (DPR)

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `project_id` | UUID | ✅ FK → projects | |
| `report_date` | DATE | ✅ | The day being reported |
| `staff_present` | INTEGER | ✅ | Count |
| `material_received` | DECIMAL(10,2) | ✅ | |
| `material_used` | DECIMAL(10,2) | ✅ | |
| `notes` | TEXT | ❌ | Daily summary |
| `created_by` | UUID | ✅ FK → users | |
| `created_at` | TIMESTAMP | ✅ | Auto |

**Unique constraint:** `(project_id, report_date)` — one DPR per project per day.

---

### Table 17: `mom` (Minutes of Meeting)

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `project_id` | UUID | ✅ FK → projects | |
| `title` | VARCHAR(255) | ✅ | Meeting subject |
| `meeting_date` | DATE | ✅ | |
| `notes` | TEXT | ❌ | Meeting minutes |
| `action_items` | JSONB | ❌ | Array of {description, assignee_id, due_date} |
| `created_by` | UUID | ✅ FK → users | |
| `created_at` | TIMESTAMP | ✅ | Auto |

---

### Table 18: `mom_attendees`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `mom_id` | UUID | ✅ FK → mom | |
| `party_id` | UUID | ❌ FK → parties | External attendee |
| `user_id` | UUID | ❌ FK → users | Internal attendee |

---

### Table 19: `design_files`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `project_id` | UUID | ✅ FK → projects | |
| `type` | ENUM('2d_layout','3d_layout','production_file') | ✅ | Sub-tab category |
| `name` | VARCHAR(255) | ✅ | File name |
| `file_url` | TEXT | ✅ | S3 URL |
| `thumbnail_url` | TEXT | ❌ | Preview image |
| `uploaded_by` | UUID | ✅ FK → users | |
| `created_at` | TIMESTAMP | ✅ | Auto |

---

### Table 20: `project_files`
*(General document folders and files — Files tab)*

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `project_id` | UUID | ✅ FK → projects | |
| `parent_folder_id` | UUID | ❌ FK → project_files (self) | NULL = root folder |
| `is_folder` | BOOLEAN | ✅ | true = folder, false = file |
| `name` | VARCHAR(255) | ✅ | Folder or file name |
| `file_url` | TEXT | ❌ | NULL if folder |
| `file_type` | VARCHAR(50) | ❌ | pdf, jpg, png, docx, etc. |
| `uploaded_by` | UUID | ✅ FK → users | |
| `created_at` | TIMESTAMP | ✅ | Auto |

---

### Table 21: `chat_groups`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `company_id` | UUID | ✅ FK → companies | |
| `name` | VARCHAR(255) | ✅ | Group name |
| `avatar_url` | TEXT | ❌ | Group icon |
| `is_announcement` | BOOLEAN | ✅ | Default false — "Onsite Announcements" = true |
| `created_by` | UUID | ✅ FK → users | |
| `created_at` | TIMESTAMP | ✅ | Auto |

---

### Table 22: `chat_group_members`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `group_id` | UUID | ✅ FK → chat_groups | |
| `user_id` | UUID | ✅ FK → users | |
| `joined_at` | TIMESTAMP | ✅ | Auto |
| `role` | ENUM('admin','member') | ✅ | Default: member |

---

### Table 23: `chat_messages`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `group_id` | UUID | ✅ FK → chat_groups | |
| `sender_id` | UUID | ✅ FK → users | |
| `message` | TEXT | ❌ | Text content |
| `attachment_url` | TEXT | ❌ | Photo/file if any |
| `created_at` | TIMESTAMP | ✅ | Auto |

---

### Table 24: `notifications`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ PK | |
| `user_id` | UUID | ✅ FK → users | Recipient |
| `company_id` | UUID | ✅ FK → companies | |
| `type` | VARCHAR(100) | ✅ | e.g., 'approval_request', 'task_update', 'material_request' |
| `title` | VARCHAR(255) | ✅ | Notification headline |
| `body` | TEXT | ❌ | Detail message |
| `entity_type` | VARCHAR(50) | ❌ | 'transaction', 'task', 'material_request', etc. |
| `entity_id` | UUID | ❌ | ID of the related record |
| `is_read` | BOOLEAN | ✅ | Default false |
| `created_at` | TIMESTAMP | ✅ | Auto |

---

### Entity Relationship Summary

```
companies
  ├── users (many)
  ├── projects (many)
  │    ├── project_members (many)
  │    ├── transactions (many)
  │    ├── tasks (many)
  │    ├── attendance_records (many)
  │    ├── site_photos (many)
  │    ├── materials (many)
  │    │    └── material_requests (many)
  │    ├── daily_progress_reports (one per day)
  │    ├── mom (many)
  │    │    └── mom_attendees (many)
  │    ├── design_files (many)
  │    └── project_files (tree structure)
  ├── parties (many)
  │    └── party_project_balances (one per party+project)
  ├── quotations (many)
  │    └── quotation_categories (many)
  │         └── quotation_items (many)
  └── chat_groups (many)
       ├── chat_group_members (many)
       └── chat_messages (many)
```

---

## 15. API Function Specifications

All endpoints are prefixed with `/api/v1`. All require `Authorization: Bearer <JWT>` header except auth endpoints. All responses return `{ success, data, error }`.

---

### Auth Module

| Method | Endpoint | Body | Returns | Notes |
|--------|----------|------|---------|-------|
| POST | `/auth/register` | `{company_name, name, email, password, phone}` | `{token, user, company}` | Creates company + owner user |
| POST | `/auth/login` | `{email, password}` | `{token, user, company}` | Returns JWT |
| POST | `/auth/logout` | — | `{success}` | Invalidates token |
| GET | `/auth/me` | — | `{user, company}` | Current session |

---

### Companies Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/companies/me` | — | Company profile |
| PUT | `/companies/me` | `{name, logo_url}` | Updated company |
| GET | `/companies/me/settings` | — | Settings object |
| PUT | `/companies/me/settings` | Settings payload | Updated settings |
| POST | `/companies/me/backup` | — | Triggers manual backup |

---

### Users / Team Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/users` | — | All team members |
| POST | `/users/invite` | `{email, role}` | Invite sent |
| PUT | `/users/:id/role` | `{role}` | Updated user |
| DELETE | `/users/:id` | — | Deactivates user |

---

### Projects Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/projects` | `?status=active&search=X` | Paginated project list with financial totals |
| POST | `/projects` | `{name, address, start_date, end_date, project_value, attendance_radius_m, thumbnail_url}` | Created project |
| GET | `/projects/:id` | — | Full project object |
| PUT | `/projects/:id` | Same as POST body | Updated project |
| DELETE | `/projects/:id` | — | Archives project |
| GET | `/projects/:id/summary` | — | `{balance, total_in, total_out, invoice, total_expense, progress_percent}` |

**Project Members:**

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/projects/:id/members` | — | Member list |
| POST | `/projects/:id/members` | `{user_id, role}` | Added member |
| PUT | `/projects/:id/members/:userId` | `{role}` | Updated role |
| DELETE | `/projects/:id/members/:userId` | — | Removed member |

---

### Transactions Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/projects/:id/transactions` | `?type=&party_id=&date_from=&date_to=&payment_method=&cost_code=&is_billed=` | Filtered transaction list |
| POST | `/projects/:id/transactions` | `{type, party_id, amount, description, reference_number, payment_method, cost_code, category, transaction_date, attachment_urls}` | Created transaction |
| GET | `/projects/:id/transactions/:txId` | — | Single transaction |
| PUT | `/projects/:id/transactions/:txId` | Same as POST | Updated transaction |
| DELETE | `/projects/:id/transactions/:txId` | — | Deleted transaction |

**Business logic — `POST /transactions`:**
1. Insert record into `transactions`
2. Recalculate `party_project_balances` for the party:
   - If `type = 'payment_in'`: `total_in += amount`
   - If `type = 'payment_out'`: `total_out += amount`
   - `balance = total_in - total_out`
3. Recalculate project `total_in`, `total_out`, `balance` aggregates

---

### Quotations Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/quotations` | `?status=&search=` | Quotation list |
| POST | `/quotations` | `{name, client_party_id, item_level_tax}` | Created quotation |
| GET | `/quotations/:id` | — | Full quotation with categories + items |
| PUT | `/quotations/:id` | `{name, status, round_off, tax_percent}` | Updated |
| DELETE | `/quotations/:id` | — | Deleted |
| GET | `/quotations/:id/pdf` | — | Generates + returns PDF blob |
| POST | `/quotations/:id/share` | `{method: 'whatsapp'|'email', recipient}` | Shares quotation |

**Quotation Categories:**

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| POST | `/quotations/:id/categories` | `{name, sort_order}` | Created category |
| PUT | `/quotations/:id/categories/:catId` | `{name}` | Updated |
| DELETE | `/quotations/:id/categories/:catId` | — | Deletes category + all items |

**Quotation Items:**

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| POST | `/quotations/:id/categories/:catId/items` | `{description, unit, quantity, rate, amount, tax_percent, sort_order}` | Created item |
| PUT | `/quotations/:id/categories/:catId/items/:itemId` | Same | Updated |
| DELETE | `/quotations/:id/categories/:catId/items/:itemId` | — | Deleted |

**Business logic — item amount:**
```
amount = quantity × rate   (if both provided)
category.subtotal = SUM(items.amount)
quotation.total_amount = SUM(categories.subtotal) + tax (if item_level_tax) ± round_off
```

---

### Parties Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/parties` | `?type=&status=active&search=` | Party list with balances |
| POST | `/parties` | `{name, type, phone, phone_country_code, email, father_name, date_of_joining, address, aadhar_number, aadhar_doc_url}` | Created party |
| GET | `/parties/:id` | — | Party detail + balance |
| PUT | `/parties/:id` | Same as POST | Updated |
| DELETE | `/parties/:id` | — | Deactivates party |
| GET | `/parties/:id/transactions` | `?project_id=` | All transactions for a party |

**Balance calculation function:**
```typescript
function getPartyBalance(partyId: string, projectId?: string) {
  // If projectId: return balance for that project only
  // If no projectId: return global balance across all projects
  const totalIn = SUM(transactions WHERE party_id = partyId AND type = 'payment_in')
  const totalOut = SUM(transactions WHERE party_id = partyId AND type = 'payment_out')
  return { totalIn, totalOut, balance: totalIn - totalOut }
}
```

---

### Tasks Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/projects/:id/tasks` | `?status=&assignee_id=&sort=as_schedule` | Task list |
| POST | `/projects/:id/tasks` | `{description, duration_days, start_date, end_date, progress_unit, estimated_quantity, assignee_id, attachment_urls}` | Created task |
| GET | `/projects/:id/tasks/:taskId` | — | Task detail |
| PUT | `/projects/:id/tasks/:taskId` | Same as POST + `{completed_quantity}` | Updated |
| DELETE | `/projects/:id/tasks/:taskId` | — | Deleted |
| PATCH | `/projects/:id/tasks/:taskId/progress` | `{completed_quantity}` | Updates progress |

**Business logic — progress_percent:**
```
progress_percent = (completed_quantity / estimated_quantity) × 100
status:
  completed_quantity == 0           → 'not_started'
  completed_quantity < estimated    → 'ongoing'
  completed_quantity >= estimated   → 'completed'
```

**Project progress_percent:**
```
project.progress_percent = AVG(tasks.progress_percent) for all tasks in project
```

---

### Attendance Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/projects/:id/attendance` | `?date=YYYY-MM-DD&type=site_staff|labour_contractor` | Attendance for a day |
| POST | `/projects/:id/attendance` | `{party_id, date, status}` | Marks attendance |
| PUT | `/projects/:id/attendance/:recordId` | `{status}` | Updates status |
| GET | `/projects/:id/attendance/summary` | `?date=` | `{present, absent, paid_leave, week_off}` |

---

### Site Module (DPR)

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/projects/:id/site` | `?date=YYYY-MM-DD` | Daily site summary |
| POST | `/projects/:id/dpr` | `{report_date, notes}` | Creates DPR (auto-populates from attendance + materials) |
| GET | `/projects/:id/dpr/:reportId` | — | DPR detail |

**DPR auto-population logic:**
```
staff_present = COUNT(attendance WHERE date = report_date AND status = 'present')
material_received = SUM(material_requests WHERE date = report_date AND status = 'received')
material_used = SUM(materials.used_qty changes on report_date)
```

---

### Materials Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/projects/:id/materials` | `?tab=inventory|request|received|used` | Materials list |
| POST | `/projects/:id/materials` | `{name, unit}` | Add material to inventory |
| POST | `/projects/:id/materials/:matId/request` | `{requested_qty}` | Create request |
| PUT | `/projects/:id/materials/requests/:reqId` | `{status, approved_by}` | Approve/reject request |
| POST | `/projects/:id/materials/:matId/receive` | `{received_qty, date}` | Record receipt (increments received_qty) |
| POST | `/projects/:id/materials/:matId/use` | `{used_qty, date}` | Record usage (increments used_qty) |

---

### Design Files Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/projects/:id/design` | `?type=2d_layout|3d_layout|production_file` | Design files list |
| POST | `/projects/:id/design` | `{type, name, file_url, thumbnail_url}` | Upload design |
| DELETE | `/projects/:id/design/:fileId` | — | Delete file |

---

### Project Files Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/projects/:id/files` | `?folder_id=` | Contents of a folder (or root) |
| POST | `/projects/:id/files/folder` | `{name, parent_folder_id}` | Create folder |
| POST | `/projects/:id/files/upload` | `{name, file_url, file_type, parent_folder_id}` | Upload file |
| DELETE | `/projects/:id/files/:fileId` | — | Delete file or folder (recursive) |

---

### Site Photos Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/projects/:id/photos` | `?date=` | Photos for a date |
| POST | `/projects/:id/photos` | `{photo_url, taken_date, caption}` | Upload photo |
| DELETE | `/projects/:id/photos/:photoId` | — | Delete photo |

---

### MOM Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/projects/:id/mom` | `?attendee_id=` | MOM list |
| POST | `/projects/:id/mom` | `{title, meeting_date, notes, action_items, attendee_ids}` | Create MOM |
| GET | `/projects/:id/mom/:momId` | — | MOM detail |
| PUT | `/projects/:id/mom/:momId` | Same as POST | Update MOM |

---

### Chats Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/chats/groups` | — | All chat groups for company |
| POST | `/chats/groups` | `{name, member_user_ids}` | Create group |
| GET | `/chats/groups/:groupId/messages` | `?before_id=&limit=50` | Paginated messages |
| POST | `/chats/groups/:groupId/messages` | `{message, attachment_url}` | Send message |
| POST | `/chats/groups/:groupId/members` | `{user_id}` | Add member |

**Real-time:** Use WebSocket (Socket.io) for live message delivery.

---

### Notifications Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/notifications` | `?is_read=false` | Unread notifications |
| PATCH | `/notifications/:id/read` | — | Mark as read |
| PATCH | `/notifications/read-all` | — | Mark all as read |

---

### File Upload Module

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| POST | `/upload/presigned-url` | `{file_type, folder}` | S3 presigned URL + final URL |

**Flow:** App requests presigned URL → uploads directly to S3 → saves URL to DB.

---

## 16. Business Logic Rules

### 16.1 Financial Calculations

```typescript
// Project balance
project.balance = project.total_in - project.total_out

// Party balance within a project
partyBalance.balance = partyBalance.total_in - partyBalance.total_out

// Quotation total
quotationTotal = categories.reduce((sum, cat) => {
  catSubtotal = cat.items.reduce((s, item) => s + item.amount, 0)
  catTax = item_level_tax ? catSubtotal * (item.tax_percent / 100) : 0
  return sum + catSubtotal + catTax
}, 0)
if (round_off) quotationTotal = Math.round(quotationTotal)
```

### 16.2 Task Progress

```typescript
// When completed_quantity is updated:
progress_percent = (completed_quantity / estimated_quantity) * 100

if (completed_quantity === 0) status = 'not_started'
else if (completed_quantity >= estimated_quantity) status = 'completed'
else status = 'ongoing'

// Project overall progress = average of all task progress
project.progress_percent = tasks.reduce((sum, t) => sum + t.progress_percent, 0) / tasks.length
```

### 16.3 Quotation Status Workflow

```
Draft → In Discussion → Approved
                      → Rejected
Approved → Converted (becomes a project transaction)
```

### 16.4 Material Stock

```typescript
material.in_stock_qty = material.received_qty - material.used_qty
// Alert if in_stock_qty < 0 (over-used)
// Alert if material_request is pending > 3 days
```

### 16.5 Attendance Geo-fence

```typescript
// On attendance check-in via mobile:
const distance = haversine(userLocation, projectLocation)
if (distance > project.attendance_radius_m) {
  throw new Error('You are too far from the project site')
}
// Otherwise mark as 'present'
```

### 16.6 Access Control (Role-Based)

| Feature | Owner | Admin | Member | Viewer |
|---------|-------|-------|--------|--------|
| Create project | ✅ | ✅ | ❌ | ❌ |
| Edit project | ✅ | ✅ | ❌ | ❌ |
| Add transaction | ✅ | ✅ | ✅ | ❌ |
| Approve transaction | ✅ | ✅ | ❌ | ❌ |
| Mark attendance | ✅ | ✅ | ✅ | ❌ |
| View financials | ✅ | ✅ | ✅ | ✅ |
| Create quotation | ✅ | ✅ | ✅ | ❌ |
| Manage team | ✅ | ✅ | ❌ | ❌ |
| Change plan | ✅ | ❌ | ❌ | ❌ |

### 16.7 Plan / Feature Gating

```typescript
function canAccessFeature(company: Company, feature: string): boolean {
  const freePlan = ['projects','quotations','parties_list','tasks','attendance','chats']
  const businessPlan = [...freePlan, 'party_detail','boq','budget_control','central_warehouse','purchase_orders','assets']
  
  if (company.plan === 'free') return freePlan.includes(feature)
  if (company.plan === 'business') return businessPlan.includes(feature)
  if (company.plan === 'business_plus') return true
  return false
}
```

---

## 17. Authentication & Session Flow

```
User opens app
      │
      ▼
[Splash Screen - 2s]
      │
      ├── Has valid JWT token? ──YES──► [Projects Dashboard]
      │
      └── NO ──► [Login Screen]
                      │
                      ├── Enter email + password ──► POST /auth/login
                      │         │
                      │         ├── Success ──► Store JWT in SecureStore ──► [Projects Dashboard]
                      │         └── Fail ──► Show error inline
                      │
                      └── "Register" ──► [Register Screen]
                                │
                                ├── Company name, Name, Email, Password
                                └── POST /auth/register ──► Auto-login ──► [Projects Dashboard]
```

**JWT Storage:** Use `expo-secure-store` (not AsyncStorage) for security.  
**Token expiry:** 7 days; refresh silently using refresh token.

---

## 18. App State Management

### Global State (Zustand stores)

```typescript
// authStore — current user + company
{
  user: User | null
  company: Company | null
  token: string | null
  setAuth: (user, company, token) => void
  logout: () => void
}

// uiStore — navigation + loading states
{
  isLoading: boolean
  activeProjectId: string | null
  setActiveProject: (id) => void
}
```

### Server State (React Query)

All API data is managed via React Query for automatic caching, background refresh, and optimistic updates:

```typescript
// Key examples:
useQuery(['projects'], fetchProjects)
useQuery(['project', projectId], () => fetchProject(projectId))
useQuery(['transactions', projectId, filters], () => fetchTransactions(projectId, filters))
useMutation(createTransaction, {
  onSuccess: () => {
    queryClient.invalidateQueries(['transactions', projectId])
    queryClient.invalidateQueries(['project', projectId]) // refresh balance
  }
})
```

---

## 19. Claude Code — Build Prompt Template

Use the following as the opening prompt when starting a Claude Code session to build this app:

```
Build a React Native (Expo + TypeScript) mobile app called "Onsite" — 
a construction project management app for interior designers.

Reference document: [attach this full report]

Build in this order:
1. Backend: Node.js + Express + Prisma + PostgreSQL
   - Implement all 24 database tables from Section 14
   - Implement all API endpoints from Section 15
   - JWT auth, role-based access from Section 16.6

2. Mobile App: React Native (Expo) + TypeScript
   - Bottom tab navigation: Quotation, Projects, Parties, Chats
   - Implement all 18 screens from Section 3
   - Implement all 10 forms from Section 9 with exact field names and validations
   - Use Zustand + React Query for state (Section 18)
   - Use React Navigation v6

3. Business Logic:
   - Financial calculations (Section 16.1)
   - Task progress computation (Section 16.2)
   - Quotation status workflow (Section 16.3)
   - Feature gating by plan (Section 16.7)

Start with the database schema (Prisma schema.prisma file), then auth, 
then the Projects CRUD, then work through each module.
```

---

*Full technical specification complete — ready for Claude Code to build. April 11, 2026.*
