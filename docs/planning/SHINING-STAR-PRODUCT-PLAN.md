# Shining Star product plan (simple)

Source: client proposal *ERP SYSTEM SHINING STAR ELECTROMECHANICAL WORKS*
+ what we already shipped. **Rule: one thin slice at a time — no mega-modules.**

## Already working
| Area | What it covers from the PDF |
|------|-----------------------------|
| Calculator | Automatic elevator calc + ETB price |
| Customers | Customer registration + duplicate warning |
| Projects | Lead → survey → quote → contract pipeline |
| Quotations | Quote / proforma / contract + branded PDF |
| Employees | Staff directory + role assignment |
| Assets | Elevators / stairs / other under a customer |
| Notifications | In-app inbox + colleague notices |

## Planned next (keep simple)

### 1. Employees & roles ✅
- Add/list employees (company users)
- Assign a **role** (CEO, Sales Manager, Technical, Field, Finance, …)
- Role controls what they can open (we already enforce this on the API)
- Later: pick an employee as sales/project owner on a project (fields already exist)

### 2. Asset registration (elevators, stairs, other) ✅
- One **Assets** list with a **category**: `ELEVATOR` | `STAIRS` | `OTHER`
- Link to customer + optional project/building name
- No heavy checklists yet — just a register

### 3. Notifications center ✅
- Simple in-app inbox: “quote approved”, “service due”, “assigned to you”
- SMS/email later — start with **internal alerts only**

### 4. Maintenance & follow-up
- Register a maintenance contract on an asset
- Schedule next service date + mark visits done
- Breakdown ticket: Open → Assigned → Done (no GPS/SLA theatre yet)

### 5. Settings
- Company logo/colors (branding — partially in DB already)
- Default language: **English / አማርኛ**
- Notification preferences later

### 6. Localization (EN + Amharic)
- UI strings via i18n (next-intl or similar)
- Documents stay branded; language toggle in Settings / header

## Explicitly later (PDF has them — we defer)
- Full finance ledgers, inventory warehouses, marketing campaigns
- LAN chat, Excel-everything, desktop .NET (we stay web)
- Complex multi-phase installation checklists (parked)

## How we build
1. Write a short `FEATURE-*.md` for the slice  
2. Ship API + simple admin page (drawer + pagination)  
3. Commit + push  
4. Only then start the next slice  

See also: `docs/planning/SCOPE-shining-star-mvp.md`
