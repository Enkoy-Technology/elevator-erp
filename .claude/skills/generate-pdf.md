# Skill: Generate Branded PDF Document

Generate a tenant-branded PDF using @react-pdf/renderer or Puppeteer.

## Parameters
- `documentType`: QUOTATION | PROFORMA | INVOICE | CONTRACT | REPORT | CERTIFICATE
- `dataId`: UUID of the source record
- `outputFormat`: 'buffer' | 's3-url'

## Steps
1. Fetch tenant branding from `/tenants/me/branding` (colors, logo URL, stamp, letterhead)
2. Fetch document data from the appropriate service
3. Use the template in `src/workers/pdf-generation/templates/{documentType}.tsx`
4. Inject tenant colors and logo into the template
5. Generate the PDF with @react-pdf/renderer
6. If outputFormat='s3-url', upload to S3 and return the URL
7. If outputFormat='buffer', return the Buffer
8. Log generation in the `DOCUMENTS` table
9. Queue email dispatch if the document needs delivery

## Branding Injection
- Primary color: `tenant.branding.primaryColor` (default: #1a73e8)
- Logo: `tenant.branding.logoUrl` (S3 signed URL, 200px height)
- Stamp: `tenant.branding.stampUrl` (bottom-right corner)
- Letterhead: `tenant.branding.letterheadUrl` (page header)

## Example Invocation
"Generate a quotation PDF for project ID 550e8400-e29b-41d4-a716-446655440000"
