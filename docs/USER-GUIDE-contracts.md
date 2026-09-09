# How to create and print the contracts

The system prepares the two agreements Shining Star signs on paper. The same
guide is inside the app under Docs, "Contracts & printing".

## Before you start

1. Open **Customers**, open the customer, press **Edit**, and fill in the
   **TIN** and the address. Save. These print in the parties clause.
2. Open **Settings** and check the company address, phone and TIN. They print
   as the supplier's details on every contract.

## A. Supply and installation contract (project contract)

Who: Sales Manager (or CEO, General Manager, Admin). A Salesperson can prepare
the quotation but not issue the contract.

1. **Quotations.** Create the quotation for the project, add the elevator
   line(s), price it and submit it.
2. Press **Approve** on the row. Approval issues the proforma: the proforma
   number appears under the status and the row gains a Proforma print button.
3. On the same row press **→ Contract**. You land on **Contracts** with a
   new DRAFT contract that carries the proforma's value and equipment.
4. On the contract row press **Edit** and fill the clauses:
   - Equipment notes (brand, rescue device, anything the lines do not say)
   - Delivery in working days, installation in working days
   - Delay penalty percent per day and its cap
   - "Advance released only against a guarantee cheque" if agreed
   - Warranty months and free maintenance months
   - Dispute forum, for example the Addis Ababa Chamber of Commerce
   - Additional terms, printed as Article 9 when filled
5. On the contract row press **Schedule** and enter the instalments, for
   example 80% advance on signing and 20% on commissioning. They must add up
   to the contract value.
6. **Print.** On the row press **Print**, or open the **Download** menu and
   pick **PDF** (Word and Excel are also there). A draft prints with the title
   CONTRACT DRAFT and a "not binding" note, so the customer can review it.
7. When both parties have signed on paper, press **Sign** on the row and
   confirm the date. Print again: the title is now CONTRACT with the signature
   date, and the draft note is gone.

The printed contract follows the company's paper template: parties with
address, phone and TIN; Article 1 definitions; Article 2 the equipment;
Article 3 supplier obligations with the delivery and installation periods;
Article 4 client obligations and the price in figures and words; Article 5
the payment schedule with each instalment's share; Article 6 warranty and
maintenance; Article 7 penalties; Article 8 dispute resolution; signature
lines for both parties and two witnesses.

A signed contract cannot be edited. To change it, cancel it with a reason and
issue a new one from the proforma.

## B. Maintenance and Service Agreement

Who: Sales Manager, Technical Manager or Maintenance Engineer (or CEO, General
Manager, Admin).

1. **Assets.** Register the elevator (or edit it) and fill the
   **Specification** box, one attribute per line:
   `Brand: Sigma`, `Drive: Gearless traction`, `Capacity: 630 kg`,
   `Stops: 12 (2B+G+9)`, `Speed: 1.5 m/s`.
2. **Maintenance**, press **New maintenance contract**. Choose the asset, the
   recurrence (monthly, quarterly, and so on), the start date and the next
   service date.
3. Fill **Agreement terms**: monthly fee in ETB, whether it includes VAT, the
   initial term in months, automatic renewal, notice days and cure days. Leave
   Scope of work blank to print the standard scope (periodic inspection and
   lubrication, adjustments, safety device testing, 24/7 trouble calls), or
   write your own.
4. Press **Create contract**.
5. **Print.** On the contract row press the **download** icon. The PDF is the
   Maintenance & Service Agreement: parties with TIN, Article 2 the elevator
   specification, Article 3 scope, Article 4 term and termination, Article 5
   service response, Article 6 the fee in figures and words, Article 7
   effectiveness, signature lines and two witnesses.
6. To change the fee or term later, press **Edit** on the row and download
   again.

## Direct links for the technical team

```
GET /contracts/{id}/document?format=pdf
GET /maintenance/contracts/{id}/agreement?format=pdf
```

Both are generated from the record on request. Nothing is stored as a file;
the signed paper copy is the binding one.
