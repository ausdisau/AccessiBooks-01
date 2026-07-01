#!/bin/bash
set -e

pnpm install --frozen-lockfile

# drizzle-kit push becomes interactive when it detects a new table: it asks a
# create-vs-rename SELECT prompt whose default (highlighted) option is
# "create table". `--force` only auto-accepts data-loss statements, NOT that
# prompt. Post-merge runs with stdin closed, so an unanswered prompt hangs until
# the setup times out.
#
# Feed a finite burst of carriage returns (Enter) so each prompt accepts its
# default "create table" option. A finite burst (not an infinite `yes` stream,
# which floods the introspection spinner and hangs) is written once then EOFs;
# extra newlines are harmless when there are no prompts (schema already in sync).
printf '\r%.0s' $(seq 200) | pnpm --filter @workspace/db run push-force
