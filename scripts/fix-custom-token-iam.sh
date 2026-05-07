#!/usr/bin/env bash
# Ensures the Cloud Functions runtime SA can mint Firebase custom tokens when the Admin SDK
# signs as `firebase-adminsdk-*` (see `functions/src/index.ts` → `serviceAccountId`).
#
# Grant Token Creator **on the Firebase Admin SDK service account** for principal:
#   PROJECT_NUMBER-compute@developer.gserviceaccount.com
#
# Requires: gcloud CLI + `gcloud auth login` as project Owner/Editor.
#
# Usage:
#   ./scripts/fix-custom-token-iam.sh

set -euo pipefail
PROJECT="${GCP_PROJECT:-sitexpens}"

NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
COMPUTE_SA="${NUMBER}-compute@developer.gserviceaccount.com"

ADMINS="$(gcloud iam service-accounts list --project="$PROJECT" \
  --filter='email~firebase-adminsdk' --format='value(email)')"

if [[ -z "${ADMINS}" ]]; then
  echo "Could not find firebase-adminsdk-* service account in ${PROJECT}." >&2
  exit 1
fi

echo "Project: ${PROJECT}"
echo "Compute SA: ${COMPUTE_SA}"
echo

while IFS= read -r ADMIN_SDK; do
  [[ -z "${ADMIN_SDK}" ]] && continue
  echo "Grant roles/iam.serviceAccountTokenCreator on ${ADMIN_SDK} → ${COMPUTE_SA}"
  gcloud iam service-accounts add-iam-policy-binding "$ADMIN_SDK" \
    --project="$PROJECT" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/iam.serviceAccountTokenCreator" \
    --quiet || true
done <<< "${ADMINS}"

echo
echo "Done. Ensure functions/src/index.ts sets serviceAccountId to your firebase-adminsdk email."
