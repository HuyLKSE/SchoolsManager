import { User } from '../models/User.js';

export const countUsersInSchool = async (schoolId, session = null) => {
    return await User.countDocuments({ schoolId }).session(session);
};

export const checkEmailExists = async (email, schoolId, session = null) => {
    const existing = await User.findOne({
        email,
        schoolId
    }).session(session);
    return !!existing;
};

export const checkUsernameExists = async (username, schoolId, session = null) => {
    const existing = await User.findOne({
        username,
        schoolId
    }).session(session);
    return !!existing;
};

export const createUser = async (userData, session = null) => {
    const user = new User(userData);
    await user.save({ session });
    return user;
};
