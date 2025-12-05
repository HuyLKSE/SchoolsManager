import { School } from '../models/School.js';

export const findOrCreateSchool = async (schoolName, session = null) => {
    const normalizedName = schoolName.trim();

    // Find school (Multi-tenant isolation)
    let school = await School.findOne({
        schoolName: { $regex: new RegExp(`^${normalizedName}$`, 'i') }
    }).session(session);

    let isNewSchool = false;
    if (!school) {
        // Create new school (first user will be admin)
        school = new School({
            schoolName: normalizedName,
            isActive: true, // Default to active
        });
        await school.save({ session });
        isNewSchool = true;
    }

    return { school, isNewSchool };
};

export const checkSubscription = (school) => {
    if (!school.isSubscriptionActive()) {
        throw new Error('Truong da het han dang ky. Vui long lien he quan tri vien');
    }
};
