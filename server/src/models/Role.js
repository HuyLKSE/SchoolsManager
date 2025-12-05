import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    enum: ['admin', 'teacher', 'student', 'guardian']
  },
  displayName: {
    type: String,
    required: true
  },
  permissions: [{
    type: String
  }]
}, {
  timestamps: true
});

export const Role = mongoose.model('Role', roleSchema);
