import mongoose from 'mongoose';

const workspaceSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['school', 'class'],
      required: true,
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    parentWorkspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
    },
    linkedEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    path: {
      type: String,
      required: true,
      unique: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'archived'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

workspaceSchema.index(
  { schoolId: 1, type: 1, linkedEntityId: 1 },
  { unique: true, sparse: true }
);
workspaceSchema.index({ parentWorkspace: 1 });
workspaceSchema.index({ schoolId: 1, status: 1 });

workspaceSchema.methods.isActive = function () {
  return this.status === 'active';
};

const Workspace = mongoose.model('Workspace', workspaceSchema);

export default Workspace;

