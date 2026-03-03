/**
 * Course & Module Service
 * 
 * Handles all Firestore operations for courses, modules, and content blocks.
 * All mutations trigger audit logs for legal defensibility.
 * 
 * @module services/courseService
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp,
    writeBatch,
  } from 'firebase/firestore';
  import { db } from './firebase';
  import { Course, Module, ContentBlock } from '../functions/src/types';
  import { auditService } from './auditService';
  
  // Collection references
  const COURSES_COLLECTION = 'courses';
  const MODULES_SUBCOLLECTION = 'modules';
  const BLOCKS_SUBCOLLECTION = 'blocks';
  
  // ============================================
  // TYPE CONVERTERS
  // ============================================
  
  /**
   * Converts Firestore document to Course type
   */
  const docToCourse = (doc: any): Course => ({
    id: doc.id,
    title: doc.data().title || '',
    description: doc.data().description || '',
    category: doc.data().category || 'compliance',
    ceCredits: doc.data().ceCredits || 0,
    thumbnailUrl: doc.data().thumbnailUrl || '',
    status: doc.data().status || 'draft',
    modules: [],
    estimatedHours: 0
  });
  
  /**
   * Converts Firestore document to Module type
   */
  const docToModule = (doc: any): Module => ({
    id: doc.id,
    courseId: doc.data().courseId,
    title: doc.data().title,
    description: doc.data().description,
    estimatedMinutes: doc.data().estimatedMinutes,
    order: doc.data().order || 0,
    status: doc.data().status || 'draft',
    passingScore: doc.data().passingScore || 70,
    
    // NEW: Extract weighted grading fields
    weight: doc.data().weight || 0,
    isCritical: doc.data().isCritical || false,
    
    blocks: [], // Populated separately if needed
  });
  
  /**
   * Converts Firestore document to ContentBlock type
   */
  const docToBlock = (doc: any): ContentBlock => ({
    id: doc.id,
    moduleId: doc.data().moduleId || '',
    type: doc.data().type || 'text',
    order: doc.data().order || 0,
    required: doc.data().required ?? true,
    data: doc.data().data || {},
  });
  
  // ============================================
  // COURSE OPERATIONS
  // ============================================
  
  /**
   * Fetches all courses (admin/instructor only — no status filter)
   */
  export const getCourses = async (): Promise<Course[]> => {
    const q = query(collection(db, COURSES_COLLECTION), orderBy('title'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docToCourse);
  };

  /**
   * Fetches published courses only (safe for staff users).
   * Firestore rules require status == 'published' for non-admin reads.
   */
  export const getPublishedCourses = async (): Promise<Course[]> => {
    const q = query(
      collection(db, COURSES_COLLECTION),
      where('status', '==', 'published'),
      orderBy('title')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docToCourse);
  };
  
  /**
   * Fetches a single course by ID
   */
  export const getCourse = async (courseId: string): Promise<Course | null> => {
    const docRef = doc(db, COURSES_COLLECTION, courseId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    return docToCourse(docSnap);
  };
  
  /**
   * Creates a new course
   */
  export const createCourse = async (
    course: Omit<Course, 'id' | 'modules'>,
    actorId: string,
    actorName: string
  ): Promise<string> => {
    const docRef = doc(collection(db, COURSES_COLLECTION));
    
    await setDoc(docRef, {
      ...course,
      status: 'draft',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    // Audit log
    await auditService.logToFirestore(
      actorId,
      actorName,
      'COURSE_CREATE',
      docRef.id,
      `Created course: ${course.title}`
    );
    
    return docRef.id;
  };
  
  /**
   * Updates an existing course
   */
  export const updateCourse = async (
    courseId: string,
    updates: Partial<Omit<Course, 'id' | 'modules'>>,
    actorId: string,
    actorName: string
  ): Promise<void> => {
    const docRef = doc(db, COURSES_COLLECTION, courseId);
    
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    
    // Audit log
    await auditService.logToFirestore(
      actorId,
      actorName,
      'COURSE_UPDATE',
      courseId,
      `Updated course fields: ${Object.keys(updates).join(', ')}`
    );
  };
  
  // ============================================
  // MODULE OPERATIONS
  // ============================================
  
  /**
   * Fetches all modules for a course
   */
  export const getModules = async (courseId: string): Promise<Module[]> => {
    const modulesRef = collection(db, COURSES_COLLECTION, courseId, MODULES_SUBCOLLECTION);
    const q = query(modulesRef, orderBy('order'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docToModule);
  };
  
  /**
   * Fetches a single module with its blocks
   */
  export const getModuleWithBlocks = async (
    courseId: string,
    moduleId: string
  ): Promise<Module | null> => {
    const moduleRef = doc(db, COURSES_COLLECTION, courseId, MODULES_SUBCOLLECTION, moduleId);
    const moduleSnap = await getDoc(moduleRef);
    
    if (!moduleSnap.exists()) return null;
    
    const module = docToModule(moduleSnap);
    
    // Fetch blocks
    const blocksRef = collection(moduleRef, BLOCKS_SUBCOLLECTION);
    const blocksQuery = query(blocksRef, orderBy('order'));
    const blocksSnap = await getDocs(blocksQuery);
    
    module.blocks = blocksSnap.docs.map(docToBlock);
    
    return module;
  };
  
  /**
   * Creates a new module
   */
  export const createModule = async (
    courseId: string,
    module: Omit<Module, 'id' | 'courseId' | 'blocks'>,
    actorId: string,
    actorName: string
  ): Promise<string> => {
    const modulesRef = collection(db, COURSES_COLLECTION, courseId, MODULES_SUBCOLLECTION);
    const docRef = doc(modulesRef);
    
    // CRITICAL: Ensure all fields are persisted
    await setDoc(docRef, {
      title: module.title,
      description: module.description,
      estimatedMinutes: module.estimatedMinutes,
      order: module.order ?? 0,
      status: module.status,
      passingScore: module.passingScore || 70,
      
      // NEW: Weighted grading fields
      weight: module.weight || 0,
      isCritical: module.isCritical || false,
      
      // Metadata
      courseId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    await auditService.logToFirestore(
      actorId,
      actorName,
      'MODULE_CREATE',
      docRef.id,
      `Created module: ${module.title} (weight: ${module.weight}%, critical: ${module.isCritical})`
    );
    
    return docRef.id;
  };
  
  /**
   * Updates a module
   */
  export const updateModule = async (
    courseId: string,
    moduleId: string,
    updates: Partial<Omit<Module, 'id' | 'courseId' | 'blocks'>>,
    actorId: string,
    actorName: string
  ): Promise<void> => {
    const moduleRef = doc(db, COURSES_COLLECTION, courseId, MODULES_SUBCOLLECTION, moduleId);
    
    // Build update object, only including defined fields
    const updateData: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };
    
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.estimatedMinutes !== undefined) updateData.estimatedMinutes = updates.estimatedMinutes;
    if (updates.order !== undefined) updateData.order = updates.order;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.passingScore !== undefined) updateData.passingScore = updates.passingScore;
    
    // NEW: Include weighted grading fields in updates
    if (updates.weight !== undefined) updateData.weight = updates.weight;
    if (updates.isCritical !== undefined) updateData.isCritical = updates.isCritical;
    
    await updateDoc(moduleRef, updateData);
    
    await auditService.logToFirestore(
      actorId,
      actorName,
      'MODULE_UPDATE',
      moduleId,
      `Updated module fields: ${Object.keys(updates).join(', ')}`
    );
  };
  
  // ============================================
  // CONTENT BLOCK OPERATIONS
  // ============================================
  
  /**
   * Saves all blocks for a module (batch operation)
   * This replaces all existing blocks with the provided array
   */
  export const saveModuleBlocks = async (
    courseId: string,
    moduleId: string,
    blocks: ContentBlock[],
    actorId: string,
    actorName: string
  ): Promise<void> => {
    const blocksRef = collection(
      db,
      COURSES_COLLECTION,
      courseId,
      MODULES_SUBCOLLECTION,
      moduleId,
      BLOCKS_SUBCOLLECTION
    );
    
    // Get existing blocks to delete
    const existingSnap = await getDocs(blocksRef);
    
    // Use batch for atomic operation
    const batch = writeBatch(db);
    
    // Delete all existing blocks
    existingSnap.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Add all new blocks
    blocks.forEach((block, index) => {
      const blockRef = doc(blocksRef, block.id);
      batch.set(blockRef, {
        ...block,
        moduleId,
        order: index,
        updatedAt: serverTimestamp(),
      });
    });
    
    // Update module's updatedAt
    const moduleRef = doc(db, COURSES_COLLECTION, courseId, MODULES_SUBCOLLECTION, moduleId);
    batch.update(moduleRef, { updatedAt: serverTimestamp() });
    
    await batch.commit();
    
    await auditService.logToFirestore(
      actorId,
      actorName,
      'MODULE_UPDATE',
      moduleId,
      `Saved ${blocks.length} content blocks`
    );
  };
  
  /**
   * Adds a single block to a module
   */
  export const addBlock = async (
    courseId: string,
    moduleId: string,
    block: Omit<ContentBlock, 'moduleId'>,
    actorId: string,
    actorName: string
  ): Promise<string> => {
    const blocksRef = collection(
      db,
      COURSES_COLLECTION,
      courseId,
      MODULES_SUBCOLLECTION,
      moduleId,
      BLOCKS_SUBCOLLECTION
    );
    
    const blockRef = doc(blocksRef, block.id);
    
    await setDoc(blockRef, {
      ...block,
      moduleId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    await auditService.logToFirestore(
      actorId,
      actorName,
      'BLOCK_CREATE',
      block.id,
      `Added ${block.type} block to module ${moduleId}`
    );
    
    return block.id;
  };
  
  /**
   * Deletes a single block
   */
  export const deleteBlock = async (
    courseId: string,
    moduleId: string,
    blockId: string,
    actorId: string,
    actorName: string
  ): Promise<void> => {
    const blockRef = doc(
      db,
      COURSES_COLLECTION,
      courseId,
      MODULES_SUBCOLLECTION,
      moduleId,
      BLOCKS_SUBCOLLECTION,
      blockId
    );
    
    await deleteDoc(blockRef);
    
    await auditService.logToFirestore(
      actorId,
      actorName,
      'BLOCK_DELETE',
      blockId,
      `Deleted block from module ${moduleId}`
    );
  };