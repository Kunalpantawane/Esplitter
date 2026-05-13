function getGroupMemberIds(group) {
    return (group.members || []).map(String);
}

function isGroupMember(group, userId) {
    return getGroupMemberIds(group).includes(String(userId));
}

function getMemberRole(group, userId) {
    const uid = String(userId);
    if (String(group.adminId) === uid) return 'admin';

    if (group.memberRoles && typeof group.memberRoles.get === 'function') {
        return group.memberRoles.get(uid) || 'member';
    }

    if (group.memberRoles && typeof group.memberRoles === 'object') {
        return group.memberRoles[uid] || 'member';
    }

    return 'member';
}

function isGroupAdmin(group, userId) {
    return getMemberRole(group, userId) === 'admin';
}

module.exports = {
    getGroupMemberIds,
    isGroupMember,
    getMemberRole,
    isGroupAdmin,
};