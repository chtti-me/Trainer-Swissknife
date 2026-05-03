import { z } from 'zod';

export const courseSchema = z.object({
  code: z.string().default(''),
  name: z.string(),
  hours: z.number().nonnegative().default(0),
  instructor: z.string().default(''),
});

export const mentorSchema = z.object({
  name: z.string().default(''),
  phone: z.string().optional().default(''),
  email: z.string().optional().default(''),
});

export const classPlanSchema = z.object({
  classCode: z.string().default(''),
  title: z.string().default(''),
  termNumber: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().optional().default(''),
  classDays: z.array(z.string()).default([]),
  startTime: z.string().default(''),
  endTime: z.string().default(''),
  totalHours: z.number().default(0),
  location: z.string().default(''),
  audience: z.array(z.string()).default([]),
  prerequisites: z.string().default(''),
  objectives: z.array(z.string()).default([]),
  mentor: mentorSchema.default({ name: '' }),
  courses: z.array(courseSchema).default([]),
  registrationUrl: z.string().optional().default(''),
  syllabusUrl: z.string().optional().default(''),
});

export type Course = z.infer<typeof courseSchema>;
export type Mentor = z.infer<typeof mentorSchema>;
export type ClassPlan = z.infer<typeof classPlanSchema>;

export const emptyClassPlan = (): ClassPlan => ({
  classCode: '',
  title: '',
  termNumber: '',
  startDate: '',
  endDate: '',
  classDays: [],
  startTime: '',
  endTime: '',
  totalHours: 0,
  location: '',
  audience: [],
  prerequisites: '',
  objectives: [],
  mentor: { name: '', phone: '', email: '' },
  courses: [],
  registrationUrl: '',
  syllabusUrl: '',
});
