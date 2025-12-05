/**
 * Role Presets - Template permissions cho từng vai trò
 * Sử dụng để nhanh chóng gán quyền theo vai trò chuẩn
 */

export const ROLE_PRESETS = {
  // ==================== ADMIN ====================
  admin: {
    displayName: 'Quản Trị Viên',
    description: 'Toàn quyền quản lý hệ thống, trường học và người dùng',
    permissions: {
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canViewAll: true,
      canManageUsers: true,
      canManageSchool: true,
    },
    color: 'red',
  },

  // ==================== TEACHER ====================
  teacher: {
    displayName: 'Giáo Viên',
    description: 'Quản lý học sinh, điểm, điểm danh trong lớp phụ trách',
    permissions: {
      canCreate: true,   // Tạo học sinh, điểm, điểm danh
      canUpdate: true,   // Sửa thông tin học sinh, điểm
      canDelete: false,  // Không xóa (chỉ admin)
      canViewAll: true,  // Xem toàn bộ học sinh trong trường
      canManageUsers: false,
      canManageSchool: false,
    },
    color: 'blue',
  },

  // ==================== STUDENT ====================
  student: {
    displayName: 'Học Sinh',
    description: 'Xem điểm, lịch học, thông tin cá nhân',
    permissions: {
      canCreate: false,
      canUpdate: false,  // Có thể cập nhật profile của mình
      canDelete: false,
      canViewAll: false, // Chỉ xem dữ liệu của mình
      canManageUsers: false,
      canManageSchool: false,
    },
    color: 'green',
  },

  // ==================== PARENT ====================
  parent: {
    displayName: 'Phụ Huynh',
    description: 'Xem thông tin học tập, điểm danh, khoản thu của con em',
    permissions: {
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canViewAll: false, // Chỉ xem con em của mình
      canManageUsers: false,
      canManageSchool: false,
    },
    color: 'purple',
  },

  // ==================== USER (Default) ====================
  user: {
    displayName: 'Người Dùng',
    description: 'Tài khoản cơ bản, chờ phân quyền',
    permissions: {
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canViewAll: false,
      canManageUsers: false,
      canManageSchool: false,
    },
    color: 'gray',
  },

  // ==================== STAFF (Optional) ====================
  staff: {
    displayName: 'Nhân Viên',
    description: 'Quản lý khoản thu, thanh toán, học phí',
    permissions: {
      canCreate: true,   // Tạo khoản thu, thanh toán
      canUpdate: true,   // Cập nhật trạng thái thanh toán
      canDelete: false,
      canViewAll: true,  // Xem toàn bộ thanh toán
      canManageUsers: false,
      canManageSchool: false,
    },
    color: 'yellow',
  },

  // ==================== SUB-ADMIN ====================
  subadmin: {
    displayName: 'Phó Quản Trị',
    description: 'Quản lý người dùng nhưng không chỉnh sửa cài đặt trường',
    permissions: {
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canViewAll: true,
      canManageUsers: true,
      canManageSchool: false, // Không chỉnh sửa cài đặt trường
    },
    color: 'orange',
  },
};

/**
 * Lấy permissions theo role
 * @param {string} role - Role name
 * @returns {Object} Permissions object
 */
export const getPermissionsByRole = (role) => {
  const preset = ROLE_PRESETS[role] || ROLE_PRESETS.user;
  return preset.permissions;
};

/**
 * Lấy tất cả role presets (dùng cho dropdown)
 * @returns {Array} Array of role presets
 */
export const getAllRolePresets = () => {
  return Object.entries(ROLE_PRESETS).map(([key, value]) => ({
    role: key,
    ...value,
  }));
};

/**
 * Kiểm tra role có hợp lệ không
 * @param {string} role - Role name
 * @returns {boolean}
 */
export const isValidRole = (role) => {
  return Object.keys(ROLE_PRESETS).includes(role);
};

/**
 * So sánh permissions với role preset
 * @param {Object} permissions - Current permissions
 * @param {string} role - Role to compare
 * @returns {boolean} True if permissions match role preset
 */
export const matchesRolePreset = (permissions, role) => {
  const preset = getPermissionsByRole(role);
  return JSON.stringify(permissions) === JSON.stringify(preset);
};

export default ROLE_PRESETS;
