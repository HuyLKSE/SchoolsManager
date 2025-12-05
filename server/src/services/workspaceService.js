import mongoose from 'mongoose';
import Workspace from '../models/Workspace.js';
import { School } from '../models/School.js';
import Class from '../models/Class.js';

const buildCode = (prefix, identifier) => {
  const sanitized =
    identifier?.toString().replace(/[^a-zA-Z0-9]/g, '') ||
    mongoose.Types.ObjectId.createFromTime(Date.now()).toString().slice(-6);
  return `${prefix}-${sanitized.toUpperCase()}`;
};

const buildPath = (segments = []) => segments.join('::');

const mapClassStatusToWorkspaceStatus = (status) => {
  const normalized = status?.toLowerCase();
  if (normalized?.includes('hoạt') || normalized?.includes('hoat')) return 'active';
  if (normalized?.includes('kết') || normalized?.includes('ket')) return 'archived';
  return 'inactive';
};

export const ensureSchoolWorkspace = async (schoolId) => {
  const schoolObjectId = typeof schoolId === 'object' && schoolId !== null && schoolId._id 
    ? schoolId._id 
    : schoolId;
  
  const school = await School.findById(schoolObjectId);
  
  if (!school) {
    throw new Error('School not found for workspace creation');
  }

  console.log('[DEBUG ensureSchoolWorkspace] school:', {
    _id: school._id,
    schoolName: school.schoolName,
    schoolCode: school.schoolCode,
    hasSchoolName: !!school.schoolName
  });

  if (school.workspace?.workspaceId) {
    const workspace = await Workspace.findById(school.workspace.workspaceId);
    if (workspace) {
      return workspace;
    }
  }

  let existing = await Workspace.findOne({
    schoolId: school._id,
    type: 'school',
    linkedEntityId: school._id,
  });

  if (!existing) {
    const code = buildCode('SCH', school.schoolCode || school.schoolName);
    const path = buildPath([`school:${school._id.toString()}`]);
    
    console.log('[DEBUG ensureSchoolWorkspace] Creating workspace with name:', school.schoolName);
    
    existing = await Workspace.create({
      type: 'school',
      schoolId: school._id,
      linkedEntityId: school._id,
      name: school.schoolName,
      code,
      path,
      metadata: {
        schoolCode: school.schoolCode,
        plan: school.subscriptionPlan,
        timezone: school.settings?.timezone,
      },
      status: school.isActive ? 'active' : 'inactive',
    });
  }

  if (!school.workspace || school.workspace.workspaceId?.toString() !== existing._id.toString()) {
    await School.updateOne(
      { _id: school._id },
      {
        $set: {
          workspace: {
            workspaceId: existing._id,
            code: existing.code,
            path: existing.path,
          },
        },
      }
    );
  }

  return existing;
};

export const syncClassWorkspace = async (classLike) => {
  const classDoc =
    typeof classLike === 'object' && classLike !== null && classLike._id
      ? classLike
      : await Class.findById(classLike);

  if (!classDoc) {
    throw new Error('Class not found for workspace sync');
  }

  const schoolWorkspace = await ensureSchoolWorkspace(classDoc.schoolId);
  const code = buildCode('CLS', classDoc.classCode || classDoc.name || classDoc.className);
  const path = buildPath([schoolWorkspace.path, `class:${classDoc._id.toString()}`]);

  console.log('[DEBUG workspaceService] classDoc fields:', {
    _id: classDoc._id,
    name: classDoc.name,
    className: classDoc.className,
    classCode: classDoc.classCode,
    hasName: !!classDoc.name
  });

  const workspaceName = classDoc.name || classDoc.className;
  console.log('[DEBUG workspaceService] workspaceName:', workspaceName);

  if (!workspaceName) {
    throw new Error(`Cannot create workspace: classDoc has no name field (classId: ${classDoc._id})`);
  }

  const workspace = await Workspace.findOneAndUpdate(
    {
      schoolId: classDoc.schoolId,
      type: 'class',
      linkedEntityId: classDoc._id,
    },
    {
      $set: {
        parentWorkspace: schoolWorkspace._id,
        name: workspaceName,
        code,
        path,
        metadata: {
          grade: classDoc.grade,
          academicYear: classDoc.academicYear,
          capacity: classDoc.capacity,
          classroom: classDoc.classroom || '',
        },
        status: mapClassStatusToWorkspaceStatus(classDoc.status),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  if (
    !classDoc.workspace ||
    classDoc.workspace.workspaceId?.toString() !== workspace._id.toString() ||
    classDoc.workspace.code !== workspace.code
  ) {
    await Class.updateOne(
      { _id: classDoc._id },
      {
        $set: {
          'workspace.workspaceId': workspace._id,
          'workspace.parentWorkspaceId': schoolWorkspace._id,
          'workspace.code': workspace.code,
          'workspace.path': workspace.path,
        },
      }
    );
  }

  return workspace;
};

export const ensureClassWorkspaceId = async (classId, schoolId) => {
  const classDoc = await Class.findOne({ _id: classId, schoolId }).select('workspace schoolId');
  if (!classDoc) {
    return null;
  }

  if (classDoc.workspace?.workspaceId) {
    return classDoc.workspace.workspaceId;
  }

  const workspace = await syncClassWorkspace(classDoc);
  return workspace?._id || null;
};

export const removeClassWorkspace = async (classId, schoolId) => {
  await Workspace.deleteOne({
    schoolId,
    type: 'class',
    linkedEntityId: classId,
  });
};

