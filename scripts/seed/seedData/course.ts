/**
 * Seed Course Data — Hospice Documentation Fundamentals
 *
 * Complete course definition with 3 modules and all content blocks.
 * Exercises every code path: non-critical + critical modules, all 5 quiz
 * question types, auto-grading, manual review (short-answer), weighted grades.
 *
 * IMPORTANT: MC/TF correctAnswer values are NUMERIC INDICES (0-based),
 * not string text. See utils/gradeCalculation.ts:100.
 */

// ============================================
// COURSE METADATA
// ============================================

export const COURSE = {
  title: 'Hospice Documentation Fundamentals',
  description:
    'Essential training on proper documentation practices for hospice care, ' +
    'covering regulatory requirements, clinical note-writing standards, and ' +
    'interdisciplinary communication protocols required by CMS and state licensing boards.',
  category: 'hospice' as const,
  ceCredits: 3.0,
  thumbnailUrl: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&h=200&fit=crop',
  status: 'draft' as const,
  estimatedHours: 2.5,
};

// ============================================
// MODULE 1: Introduction (non-critical, weight 20)
// ============================================

export const MODULE_1 = {
  title: 'Introduction to Hospice Documentation',
  description:
    'Overview of documentation requirements in hospice care, including regulatory ' +
    'context, the role of documentation in care coordination, and the consequences ' +
    'of incomplete or inaccurate records.',
  estimatedMinutes: 20,
  order: 0,
  status: 'draft' as const,
  passingScore: 0,
  weight: 20,
  isCritical: false,
};

export const MODULE_1_BLOCKS = [
  {
    id: 'block_m1_0',
    type: 'heading',
    order: 0,
    required: false,
    data: {
      content: 'Welcome to Hospice Documentation Fundamentals',
      level: 1,
    },
  },
  {
    id: 'block_m1_1',
    type: 'text',
    order: 1,
    required: true,
    data: {
      content:
        'Documentation is the backbone of hospice care delivery. Every clinical ' +
        'encounter, care plan update, and interdisciplinary team meeting must be ' +
        'accurately recorded in the medical record. Under the Medicare Hospice ' +
        'Benefit, the medical record serves as both a clinical tool for care ' +
        'coordination and a legal document that supports reimbursement, regulatory ' +
        'compliance, and quality assurance.\n\n' +
        'The Centers for Medicare & Medicaid Services (CMS) Conditions of ' +
        'Participation (CoPs) establish specific documentation requirements that ' +
        'every hospice organization must follow. Failure to meet these requirements ' +
        'can result in claim denials, survey deficiencies, and potential exclusion ' +
        'from the Medicare program.\n\n' +
        'This course will equip you with the knowledge and skills to produce ' +
        'complete, accurate, and timely documentation that meets CMS standards ' +
        'and supports excellent patient care.',
      variant: 'paragraph',
    },
  },
  {
    id: 'block_m1_2',
    type: 'heading',
    order: 2,
    required: false,
    data: {
      content: 'Why Documentation Matters',
      level: 2,
    },
  },
  {
    id: 'block_m1_3',
    type: 'text',
    order: 3,
    required: true,
    data: {
      content:
        'Medicare requires specific documentation within defined timeframes: ' +
        'a comprehensive assessment must be completed within 5 calendar days of ' +
        'the hospice election date, the plan of care must be reviewed and updated ' +
        'by the interdisciplinary group (IDG) at intervals not exceeding 15 days, ' +
        'and recertification documentation must be completed at each benefit ' +
        'period boundary. These timeframes are not suggestions — they are ' +
        'regulatory requirements enforced during surveys.',
      variant: 'callout-info',
    },
  },
  {
    id: 'block_m1_4',
    type: 'image',
    order: 4,
    required: true,
    data: {
      url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&fit=crop',
      caption:
        'Figure 1: The hospice documentation cycle — from admission through bereavement',
      altText:
        'Flowchart showing the hospice documentation cycle including admission, ' +
        'comprehensive assessment, plan of care, progress notes, and recertification',
    },
  },
  {
    id: 'block_m1_5',
    type: 'text',
    order: 5,
    required: true,
    data: {
      content:
        'Important: Incomplete or untimely documentation can result in claim ' +
        'denials, survey citations, and legal liability. Every clinical encounter ' +
        'must be documented within 24 hours.',
      variant: 'callout-warning',
    },
  },
];

// ============================================
// MODULE 2: Core Concepts (critical, weight 40)
// Quiz: MC, T/F, fill-blank (auto-graded)
// ============================================

export const MODULE_2 = {
  title: 'Core Documentation Concepts',
  description:
    'In-depth coverage of clinical documentation standards including SOAP notes, ' +
    'objective vs. subjective charting, medication documentation, and symptom ' +
    'management recording.',
  estimatedMinutes: 35,
  order: 1,
  status: 'draft' as const,
  passingScore: 80,
  weight: 40,
  isCritical: true,
};

export const MODULE_2_BLOCKS = [
  {
    id: 'block_m2_0',
    type: 'heading',
    order: 0,
    required: false,
    data: {
      content: 'Core Documentation Concepts',
      level: 1,
    },
  },
  {
    id: 'block_m2_1',
    type: 'text',
    order: 1,
    required: true,
    data: {
      content:
        'The SOAP note format (Subjective, Objective, Assessment, Plan) is the ' +
        'standard framework for clinical documentation in hospice care. Each ' +
        'component serves a specific purpose:\n\n' +
        'Subjective (S): Captures the patient\'s or caregiver\'s own statements, ' +
        'concerns, and perceptions. These should be documented using direct quotes ' +
        'where possible. Example: Patient states, "My pain has been worse at night ' +
        'since last week."\n\n' +
        'Objective (O): Records measurable, observable clinical data. This includes ' +
        'vital signs, wound measurements, pain scale scores, physical examination ' +
        'findings, and lab results. Example: BP 118/76, HR 82, RR 18, SpO2 95% ' +
        'on room air. Pain rated 6/10 on numeric scale.\n\n' +
        'Assessment (A): Contains the clinician\'s professional interpretation and ' +
        'clinical judgment based on the subjective and objective data. This is where ' +
        'you synthesize findings into a clinical picture. Example: Pain management ' +
        'regimen appears suboptimal; current PRN usage suggests breakthrough pain ' +
        'is not adequately controlled.\n\n' +
        'Plan (P): Outlines the specific actions, interventions, and follow-up steps. ' +
        'Example: Will contact attending physician to discuss increasing scheduled ' +
        'dose and adding breakthrough PRN. Follow-up visit in 48 hours to reassess.',
      variant: 'paragraph',
    },
  },
  {
    id: 'block_m2_2',
    type: 'text',
    order: 2,
    required: true,
    data: {
      content:
        'Remember: Objective data must be measurable and observable. ' +
        '"Patient appears uncomfortable" is subjective. ' +
        '"Patient rates pain at 7/10 on the numeric scale, grimacing, and ' +
        'guarding the right hip" is objective.',
      variant: 'callout-info',
    },
  },
  {
    id: 'block_m2_3',
    type: 'heading',
    order: 3,
    required: false,
    data: {
      content: 'Knowledge Check',
      level: 2,
    },
  },
  {
    id: 'block_m2_4',
    type: 'quiz',
    order: 4,
    required: true,
    data: {
      title: 'Core Concepts Assessment',
      passingScore: 80,
      maxAttempts: 3,
      questions: [
        // Q1 — Multiple Choice
        {
          id: 'q2_1',
          type: 'multiple-choice',
          question:
            'Which section of a SOAP note contains the clinician\'s professional ' +
            'interpretation of the patient\'s condition?',
          options: ['Subjective', 'Objective', 'Assessment', 'Plan'],
          correctAnswer: 2, // "Assessment" is index 2
          points: 20,
          explanation:
            'The Assessment section is where the clinician synthesizes the subjective ' +
            'and objective data to form a professional judgment about the patient\'s ' +
            'current status and trajectory.',
        },
        // Q2 — True/False
        {
          id: 'q2_2',
          type: 'true-false',
          question:
            'A hospice patient\'s vital signs should be documented in the Subjective ' +
            'section of a SOAP note.',
          options: ['True', 'False'],
          correctAnswer: 1, // "False" is index 1
          points: 20,
          explanation:
            'Vital signs are measurable, objective data and belong in the Objective ' +
            'section. The Subjective section is reserved for the patient\'s or ' +
            'caregiver\'s own statements and perceptions.',
        },
        // Q3 — Multiple Choice
        {
          id: 'q2_3',
          type: 'multiple-choice',
          question:
            'Under CMS Conditions of Participation, how frequently must the hospice ' +
            'interdisciplinary group (IDG) review and update the plan of care?',
          options: ['Every 7 days', 'Every 15 days', 'Every 30 days', 'Every 60 days'],
          correctAnswer: 1, // "Every 15 days" is index 1
          points: 20,
          explanation:
            'CMS requires the IDG to review, revise, and document the plan of care ' +
            'at intervals not to exceed 15 calendar days.',
        },
        // Q4 — Fill in the Blank
        {
          id: 'q2_4',
          type: 'fill-blank',
          question:
            'The Medicare Hospice Benefit requires a comprehensive assessment to be ' +
            'completed within ___ calendar days of the hospice election date.',
          options: [],
          correctAnswer: '5',
          points: 20,
          explanation:
            'CMS requires the comprehensive assessment to be completed no later ' +
            'than 5 calendar days after the hospice election date. This assessment ' +
            'establishes the baseline for the individualized plan of care.',
        },
        // Q5 — True/False
        {
          id: 'q2_5',
          type: 'true-false',
          question:
            'It is acceptable to document a hospice visit note more than 48 hours ' +
            'after the visit occurred.',
          options: ['True', 'False'],
          correctAnswer: 1, // "False" is index 1
          points: 20,
          explanation:
            'Best practice and most organizational policies require documentation ' +
            'within 24 hours of the encounter. Delayed documentation beyond 48 hours ' +
            'raises legal and compliance risks, as recall accuracy diminishes over time.',
        },
      ],
    },
  },
];

// ============================================
// MODULE 3: Practical Application (critical, weight 40)
// Quiz: matching, short-answer (triggers review queue)
// ============================================

export const MODULE_3 = {
  title: 'Practical Application & Documentation Exercises',
  description:
    'Hands-on exercises applying documentation concepts to real-world hospice ' +
    'scenarios, including proper classification of clinical data and narrative ' +
    'note composition.',
  estimatedMinutes: 30,
  order: 2,
  status: 'draft' as const,
  passingScore: 80,
  weight: 40,
  isCritical: true,
};

export const MODULE_3_BLOCKS = [
  {
    id: 'block_m3_0',
    type: 'heading',
    order: 0,
    required: false,
    data: {
      content: 'Practical Application',
      level: 1,
    },
  },
  {
    id: 'block_m3_1',
    type: 'text',
    order: 1,
    required: true,
    data: {
      content:
        'This module tests your ability to apply documentation principles to ' +
        'real clinical scenarios. You will classify clinical observations into ' +
        'the correct SOAP sections and compose clinical narratives that meet ' +
        'documentation standards.\n\n' +
        'The short-answer questions in this assessment will be reviewed by an ' +
        'instructor to evaluate the quality and accuracy of your clinical writing. ' +
        'Take your time and write thorough, professional responses.',
      variant: 'paragraph',
    },
  },
  {
    id: 'block_m3_2',
    type: 'heading',
    order: 2,
    required: false,
    data: {
      content: 'Documentation Exercises',
      level: 2,
    },
  },
  {
    id: 'block_m3_3',
    type: 'quiz',
    order: 3,
    required: true,
    data: {
      title: 'Practical Documentation Assessment',
      passingScore: 80,
      maxAttempts: 2,
      questions: [
        // Q1 — Matching
        {
          id: 'q3_1',
          type: 'matching',
          question: 'Match each clinical observation to the correct SOAP note section.',
          options: [],
          correctAnswer: '',
          matchingPairs: [
            {
              left: 'Patient states: "My pain is getting worse at night"',
              right: 'Subjective',
            },
            {
              left: 'Blood pressure: 118/76 mmHg, Pulse: 82 bpm',
              right: 'Objective',
            },
            {
              left: 'Pain management regimen appears suboptimal; consider dose adjustment',
              right: 'Assessment',
            },
            {
              left: 'Will contact attending physician to discuss PRN dose increase',
              right: 'Plan',
            },
          ],
          points: 25,
          explanation:
            'Patient statements are always Subjective. Vital signs and measurements ' +
            'are Objective. Clinical judgments are Assessment. Next steps and ' +
            'interventions are Plan.',
        },
        // Q2 — Matching
        {
          id: 'q3_2',
          type: 'matching',
          question:
            'Match each documentation item to its required timeframe under CMS regulations.',
          options: [],
          correctAnswer: '',
          matchingPairs: [
            {
              left: 'Comprehensive assessment',
              right: '5 days from election',
            },
            {
              left: 'Plan of care review by IDG',
              right: 'Every 15 days',
            },
            {
              left: 'Recertification of terminal illness',
              right: 'At each benefit period',
            },
            {
              left: 'Visit note documentation',
              right: 'Within 24 hours',
            },
          ],
          points: 25,
          explanation:
            'These timeframes are mandated by CMS Conditions of Participation and ' +
            'are frequently reviewed during surveys.',
        },
        // Q3 — Short Answer (triggers instructor review)
        {
          id: 'q3_3',
          type: 'short-answer',
          question:
            'A 78-year-old hospice patient with end-stage COPD is visited at home. ' +
            'During the visit, the patient is sitting upright in a recliner, using ' +
            '3L supplemental oxygen via nasal cannula. The patient tells you, ' +
            '"I couldn\'t catch my breath last night and my daughter almost called ' +
            '911." You observe respiratory rate of 24, SpO2 of 89% on oxygen, ' +
            'bilateral wheezes on auscultation, and mild accessory muscle use. ' +
            'Write a complete SOAP note for this encounter.',
          options: [],
          correctAnswer: '',
          points: 25,
          explanation:
            'The instructor will evaluate this response for proper SOAP structure, ' +
            'accurate classification of subjective vs. objective data, clinical ' +
            'reasoning in the assessment, and an appropriate care plan.',
        },
        // Q4 — Short Answer (triggers instructor review)
        {
          id: 'q3_4',
          type: 'short-answer',
          question:
            'Explain why the following documentation entry is problematic and ' +
            'rewrite it using proper clinical documentation standards: ' +
            '"Patient is doing poorly. Family is upset. Will continue current plan."',
          options: [],
          correctAnswer: '',
          points: 25,
          explanation:
            'The instructor will evaluate this response for identifying specific ' +
            'deficiencies (vague language, lack of measurable data, no assessment ' +
            'rationale, no specific plan actions) and providing a properly ' +
            'documented alternative.',
        },
      ],
    },
  },
];
