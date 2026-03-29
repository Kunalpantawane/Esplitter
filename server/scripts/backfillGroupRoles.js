/* eslint-disable no-console */
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();

const mongoose = require('mongoose');
const Group = require('../models/Group');

function randomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function parseFlags() {
    const args = new Set(process.argv.slice(2));
    const write = args.has('--write');
    const dryRun = args.has('--dry-run') || !write;
    return { write, dryRun };
}

async function generateUniqueInviteCode(usedCodes) {
    let attempts = 0;
    let code = randomCode();

    while (usedCodes.has(code)) {
        attempts += 1;
        code = randomCode();
        if (attempts > 50) {
            throw new Error('Unable to generate a unique invite code after many attempts.');
        }
    }

    usedCodes.add(code);
    return code;
}

function normalizeJoinRequests(joinRequests, memberIdSet) {
    const requests = Array.isArray(joinRequests) ? joinRequests : [];
    const seenPendingByUser = new Set();
    const normalized = [];

    for (const req of requests) {
        const userId = String(req.userId || '');
        if (!userId) continue;

        // Users already in group should not remain in join requests.
        if (memberIdSet.has(userId)) continue;

        const status = req.status || 'pending';
        if (!['pending', 'approved', 'rejected'].includes(status)) continue;

        // Keep only a single pending request per user.
        if (status === 'pending') {
            if (seenPendingByUser.has(userId)) continue;
            seenPendingByUser.add(userId);
        }

        normalized.push({
            userId,
            status,
            requestedAt: req.requestedAt || new Date(),
            reviewedAt: req.reviewedAt,
            reviewedBy: req.reviewedBy,
        });
    }

    return normalized;
}

async function main() {
    const { write, dryRun } = parseFlags();
    const mode = write ? 'WRITE' : 'DRY-RUN';
    console.log(`\n[backfillGroupRoles] Mode: ${mode}`);

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI is required in environment (.env).');
    }

    await mongoose.connect(uri);

    const groups = await Group.find({}).lean();
    const usedCodes = new Set(
        groups
            .map((group) => (group.inviteCode || '').toUpperCase())
            .filter(Boolean)
    );

    let scanned = 0;
    let changed = 0;
    let addedAdminToMembers = 0;
    let fixedMemberRoles = 0;
    let fixedJoinRequests = 0;
    let generatedInviteCodes = 0;

    for (const rawGroup of groups) {
        scanned += 1;

        const updates = {};
        const currentMembers = Array.isArray(rawGroup.members) ? rawGroup.members.map((id) => String(id)) : [];
        const memberIdSet = new Set(currentMembers);
        const adminId = String(rawGroup.adminId || '');

        if (adminId && !memberIdSet.has(adminId)) {
            memberIdSet.add(adminId);
            updates.members = Array.from(memberIdSet);
            addedAdminToMembers += 1;
        }

        const currentRoles = rawGroup.memberRoles || {};
        const roleObject = {};
        for (const memberId of memberIdSet) {
            roleObject[memberId] = memberId === adminId ? 'admin' : 'member';
        }

        const existingRoleEntries =
            currentRoles instanceof Map
                ? Array.from(currentRoles.entries())
                : Object.entries(currentRoles || {});

        let rolesNeedUpdate = false;
        for (const [userId, role] of existingRoleEntries) {
            const sid = String(userId);
            if (!memberIdSet.has(sid)) {
                rolesNeedUpdate = true;
                continue;
            }
            const expected = sid === adminId ? 'admin' : 'member';
            if (role !== expected) rolesNeedUpdate = true;
        }

        if (existingRoleEntries.length !== memberIdSet.size) {
            rolesNeedUpdate = true;
        }

        if (rolesNeedUpdate) {
            updates.memberRoles = roleObject;
            fixedMemberRoles += 1;
        }

        const normalizedRequests = normalizeJoinRequests(rawGroup.joinRequests, memberIdSet);
        const rawRequests = Array.isArray(rawGroup.joinRequests) ? rawGroup.joinRequests : [];
        if (normalizedRequests.length !== rawRequests.length) {
            updates.joinRequests = normalizedRequests;
            fixedJoinRequests += 1;
        }

        if (!rawGroup.inviteCode) {
            updates.inviteCode = await generateUniqueInviteCode(usedCodes);
            generatedInviteCodes += 1;
        }

        if (Object.keys(updates).length > 0) {
            changed += 1;
            if (write) {
                await Group.updateOne({ _id: rawGroup._id }, { $set: updates });
            }
        }
    }

    console.log('\n[backfillGroupRoles] Summary');
    console.log(`Scanned groups: ${scanned}`);
    console.log(`Changed groups: ${changed}`);
    console.log(`Added missing admin to members: ${addedAdminToMembers}`);
    console.log(`Fixed memberRoles: ${fixedMemberRoles}`);
    console.log(`Normalized joinRequests: ${fixedJoinRequests}`);
    console.log(`Generated invite codes: ${generatedInviteCodes}`);

    if (dryRun) {
        console.log('\nDry-run only. No DB writes were made.');
        console.log('Run with --write to persist changes.');
    } else {
        console.log('\nMigration applied successfully.');
    }

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('\n[backfillGroupRoles] Failed:', err.message);
    try {
        await mongoose.disconnect();
    } catch (_) {
        // ignore
    }
    process.exit(1);
});
