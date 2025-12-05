import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './src/models/User.js';
import { School } from './src/models/School.js';
import Student from './src/models/Student.js';

dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const schoolName = "THPT Võ Trường Toản";
        const username = "huylk";

        const school = await School.findOne({
            schoolName: { $regex: new RegExp(`^${schoolName.trim()}$`, 'i') }
        });

        if (!school) {
            console.log(`School '${schoolName}' NOT FOUND`);
        } else {
            console.log(`School found: ${school.schoolName} (${school._id})`);

            const user = await User.findOne({
                schoolId: school._id,
                username: username
            });

            if (!user) {
                console.log(`User '${username}' NOT FOUND in school`);
            } else {
                console.log(`User found: ${user.username} (${user._id})`);

                // Check students
                const studentCount = await Student.countDocuments({ schoolId: school._id });
                console.log(`Total students in school: ${studentCount}`);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

check();
