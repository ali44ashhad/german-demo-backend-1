import { Gender } from "../models/enums";
import { IUser, IBiodata, IStudentInquiry } from "../models/User";

const GENDER_VALUES = new Set<string>(Object.values(Gender));
const MAX_FAMILY_MEMBERS = 15;

function trimStr(s: unknown): string | undefined {
  if (s === undefined || s === null) return undefined;
  const t = String(s).trim();
  return t === "" ? undefined : t;
}

function parseStringArray(arr: unknown, maxLen?: number): string[] {
  if (!Array.isArray(arr)) return [];
  const out = arr.map((x) => String(x).trim()).filter(Boolean);
  return maxLen != null ? out.slice(0, maxLen) : out;
}

function parseMonth(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? Math.round(v) : parseInt(String(v).trim(), 10);
  if (Number.isNaN(n)) return undefined;
  return Math.min(12, Math.max(1, n));
}

function parseYear(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? Math.round(v) : parseInt(String(v).trim(), 10);
  if (Number.isNaN(n)) return undefined;
  if (n < 1950 || n > 2100) return undefined;
  return n;
}

function parseBioPeriod(o: Record<string, unknown>) {
  return {
    startDate: trimStr(o.startDate),
    endDate: trimStr(o.endDate),
    startMonth: parseMonth(o.startMonth),
    startYear: parseYear(o.startYear),
    endMonth: parseMonth(o.endMonth),
    endYear: parseYear(o.endYear),
  };
}

/** Only persisted enum values; unknown explicit values are dropped. */
function parseGenderField(v: unknown): Gender | undefined {
  const t = trimStr(v);
  if (!t) return undefined;
  return GENDER_VALUES.has(t) ? (t as Gender) : undefined;
}

/** Map legacy free-text sex to gender when the client did not send `gender`. */
function genderFromLegacySex(sex: string | undefined): Gender | undefined {
  if (!sex) return undefined;
  const s = sex.toLowerCase().trim();
  if (s === "male" || s === "m") return Gender.MALE;
  if (s === "female" || s === "f") return Gender.FEMALE;
  if (s.includes("trans")) return Gender.TRANSGENDER;
  if (s.includes("non-binary") || s.includes("nonbinary")) return Gender.NON_BINARY;
  if (s.includes("prefer not") || s === "n/a") return Gender.PREFER_NOT_TO_SAY;
  return Gender.OTHER;
}

function parseFamilyMembers(arr: unknown): { name?: string; occupation?: string }[] {
  if (!Array.isArray(arr)) return [];
  const out: { name?: string; occupation?: string }[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    if (out.length >= MAX_FAMILY_MEMBERS) break;
    const o = x as Record<string, unknown>;
    const name = trimStr(o.name);
    const occupation = trimStr(o.occupation);
    if (name === undefined && occupation === undefined) continue;
    const row: { name?: string; occupation?: string } = {};
    if (name !== undefined) row.name = name;
    if (occupation !== undefined) row.occupation = occupation;
    out.push(row);
  }
  return out;
}

function parseRatedItems(arr: unknown): { label: string; score: number }[] {
  if (!Array.isArray(arr)) return [];
  const out: { label: string; score: number }[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const label = trimStr(o.label);
    if (!label) continue;
    let score = Number(o.score);
    if (Number.isNaN(score)) score = 3;
    score = Math.min(5, Math.max(1, Math.round(score)));
    out.push({ label, score });
  }
  return out;
}

function isNonemptyEducationRow(row: Record<string, unknown>): boolean {
  return Boolean(
    trimStr(row.institutionName) ||
      trimStr(row.location) ||
      trimStr(row.courseOfStudy) ||
      trimStr(row.degreeType) ||
      parseMonth(row.startMonth) ||
      parseYear(row.startYear) ||
      parseMonth(row.endMonth) ||
      parseYear(row.endYear) ||
      trimStr(row.startDate) ||
      trimStr(row.endDate) ||
      parseStringArray(row.focusAreas).length
  );
}

function parseEducationBio(arr: unknown): any[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      const period = parseBioPeriod(o);
      return {
        ...period,
        institutionName: trimStr(o.institutionName),
        location: trimStr(o.location),
        courseOfStudy: trimStr(o.courseOfStudy),
        degreeType: trimStr(o.degreeType),
        focusAreas: parseStringArray(o.focusAreas),
      };
    })
    .filter((row) => isNonemptyEducationRow(row as Record<string, unknown>));
}

function isNonemptyInternshipRow(row: Record<string, unknown>): boolean {
  return Boolean(
    trimStr(row.organizationName) ||
      trimStr(row.location) ||
      trimStr(row.entryType) ||
      trimStr(row.title) ||
      row.isCurrent ||
      parseMonth(row.startMonth) ||
      parseYear(row.startYear) ||
      parseMonth(row.endMonth) ||
      parseYear(row.endYear) ||
      trimStr(row.startDate) ||
      trimStr(row.endDate) ||
      parseStringArray(row.descriptionBullets).length
  );
}

function parseInternships(arr: unknown): any[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      const period = parseBioPeriod(o);
      const isCurrent = Boolean(o.isCurrent);
      const endDate = isCurrent ? undefined : period.endDate;
      const endMonth = isCurrent ? undefined : period.endMonth;
      const endYear = isCurrent ? undefined : period.endYear;
      return {
        ...period,
        endDate,
        endMonth,
        endYear,
        isCurrent,
        organizationName: trimStr(o.organizationName),
        location: trimStr(o.location),
        entryType: trimStr(o.entryType),
        title: trimStr(o.title),
        descriptionBullets: parseStringArray(o.descriptionBullets),
      };
    })
    .filter((row) => isNonemptyInternshipRow(row as Record<string, unknown>));
}

function isNonemptyExperienceRow(row: Record<string, unknown>): boolean {
  return Boolean(
    trimStr(row.companyName) ||
      trimStr(row.location) ||
      trimStr(row.roleTitle) ||
      row.isCurrent ||
      parseMonth(row.startMonth) ||
      parseYear(row.startYear) ||
      parseMonth(row.endMonth) ||
      parseYear(row.endYear) ||
      trimStr(row.startDate) ||
      trimStr(row.endDate) ||
      parseStringArray(row.responsibilities).length
  );
}

function parseExperienceBio(arr: unknown): any[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      const period = parseBioPeriod(o);
      const isCurrent = Boolean(o.isCurrent);
      const endDate = isCurrent ? undefined : period.endDate;
      const endMonth = isCurrent ? undefined : period.endMonth;
      const endYear = isCurrent ? undefined : period.endYear;
      return {
        ...period,
        endDate,
        endMonth,
        endYear,
        isCurrent,
        companyName: trimStr(o.companyName),
        location: trimStr(o.location),
        roleTitle: trimStr(o.roleTitle),
        responsibilities: parseStringArray(o.responsibilities),
      };
    })
    .filter((row) => isNonemptyExperienceRow(row as Record<string, unknown>));
}

function parseEducationOverview(arr: unknown): any[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      return {
        degree: trimStr(o.degree),
        year: trimStr(o.year),
        fieldOfStudy: trimStr(o.fieldOfStudy),
        universityOrLocation: trimStr(o.universityOrLocation),
        percentageOrCgpa: trimStr(o.percentageOrCgpa),
      };
    });
}

function parseEnglishTest(body: unknown): any {
  if (!body || typeof body !== "object") return undefined;
  const o = body as Record<string, unknown>;
  const sec = o.sections && typeof o.sections === "object" ? (o.sections as Record<string, unknown>) : {};
  return {
    testType: trimStr(o.testType),
    overall: trimStr(o.overall),
    sections: {
      listening: trimStr(sec.listening),
      reading: trimStr(sec.reading),
      writing: trimStr(sec.writing),
      speaking: trimStr(sec.speaking),
    },
    otherNote: trimStr(o.otherNote),
  };
}

/** Mutates `user` from JSON profile body (flat + nested biodata + studentInquiry). */
export function mergeProfileBodyIntoUser(user: IUser, body: Record<string, unknown>): void {
  const u = user as any;
  const {
    name,
    profileImage,
    dateOfBirth,
    country,
    city,
    highestQualification,
    fieldOfStudy,
    graduationYear,
    marksOrCGPA,
    targetDegreeInGermany,
    desiredCourseProgram,
    preferredIntake,
    englishProficiency,
    germanLanguageLevel,
    workExperience,
    estimatedBudget,
    shortlistedUniversities,
    needHelpWith,
    agreedToTerms,
    contactNumber,
    address,
    linkedInUrl,
    fullLegalName,
    biodata,
    studentInquiry,
  } = body;

  if (name !== undefined && typeof name === "string") u.name = name.trim();
  if (profileImage !== undefined && typeof profileImage === "string") {
    const trimmed = profileImage.trim();
    if (trimmed) u.profileImage = trimmed;
    else delete u.profileImage;
  }
  if (dateOfBirth !== undefined) {
    if (dateOfBirth) u.dateOfBirth = new Date(String(dateOfBirth));
    else delete u.dateOfBirth;
  }
  if (country !== undefined && typeof country === "string") {
    const t = country.trim();
    if (t) u.country = t;
    else delete u.country;
  }
  if (city !== undefined && typeof city === "string") {
    const t = city.trim();
    if (t) u.city = t;
    else delete u.city;
  }
  if (highestQualification !== undefined && typeof highestQualification === "string") {
    const t = highestQualification.trim();
    if (t) u.highestQualification = t;
    else delete u.highestQualification;
  }
  if (fieldOfStudy !== undefined && typeof fieldOfStudy === "string") {
    const t = fieldOfStudy.trim();
    if (t) u.fieldOfStudy = t;
    else delete u.fieldOfStudy;
  }
  if (graduationYear !== undefined) {
    if (graduationYear) u.graduationYear = parseInt(String(graduationYear), 10);
    else delete u.graduationYear;
  }
  if (marksOrCGPA !== undefined && typeof marksOrCGPA === "string") {
    const t = marksOrCGPA.trim();
    if (t) u.marksOrCGPA = t;
    else delete u.marksOrCGPA;
  }
  if (targetDegreeInGermany !== undefined && typeof targetDegreeInGermany === "string") {
    const t = targetDegreeInGermany.trim();
    if (t) u.targetDegreeInGermany = t;
    else delete u.targetDegreeInGermany;
  }
  if (desiredCourseProgram !== undefined && typeof desiredCourseProgram === "string") {
    const t = desiredCourseProgram.trim();
    if (t) u.desiredCourseProgram = t;
    else delete u.desiredCourseProgram;
  }
  if (preferredIntake !== undefined && typeof preferredIntake === "string") {
    const t = preferredIntake.trim();
    if (t) u.preferredIntake = t;
    else delete u.preferredIntake;
  }
  if (englishProficiency !== undefined && typeof englishProficiency === "string") {
    const t = englishProficiency.trim();
    if (t) u.englishProficiency = t;
    else delete u.englishProficiency;
  }
  if (germanLanguageLevel !== undefined && typeof germanLanguageLevel === "string") {
    const t = germanLanguageLevel.trim();
    if (t) u.germanLanguageLevel = t;
    else delete u.germanLanguageLevel;
  }
  if (workExperience !== undefined && typeof workExperience === "string") {
    const t = workExperience.trim();
    if (t) u.workExperience = t;
    else delete u.workExperience;
  }
  if (estimatedBudget !== undefined && typeof estimatedBudget === "string") {
    const t = estimatedBudget.trim();
    if (t) u.estimatedBudget = t;
    else delete u.estimatedBudget;
  }
  if (shortlistedUniversities !== undefined && typeof shortlistedUniversities === "string") {
    const t = shortlistedUniversities.trim();
    if (t) u.shortlistedUniversities = t;
    else delete u.shortlistedUniversities;
  }
  if (needHelpWith !== undefined) {
    u.needHelpWith = Array.isArray(needHelpWith) ? (needHelpWith as string[]).map(String) : [];
  }
  if (agreedToTerms !== undefined) u.agreedToTerms = Boolean(agreedToTerms);

  if (contactNumber !== undefined && typeof contactNumber === "string") {
    const t = contactNumber.trim();
    if (t) u.contactNumber = t;
    else delete u.contactNumber;
  }
  if (address !== undefined && typeof address === "string") {
    const t = address.trim();
    if (t) u.address = t;
    else delete u.address;
  }
  if (linkedInUrl !== undefined && typeof linkedInUrl === "string") {
    const t = linkedInUrl.trim();
    if (t) u.linkedInUrl = t;
    else delete u.linkedInUrl;
  }
  if (fullLegalName !== undefined && typeof fullLegalName === "string") {
    const t = fullLegalName.trim();
    if (t) u.fullLegalName = t;
    else delete u.fullLegalName;
  }

  if (biodata !== undefined && biodata && typeof biodata === "object") {
    const b = biodata as Record<string, unknown>;
    const cur: any = { ...(user.biodata || {}) };
    if (b.professionalTitle !== undefined) cur.professionalTitle = trimStr(b.professionalTitle);
    if (b.citizenship !== undefined) cur.citizenship = trimStr(b.citizenship);
    if (b.maritalStatus !== undefined) cur.maritalStatus = trimStr(b.maritalStatus);
    if (b.skillset !== undefined) cur.skillset = parseRatedItems(b.skillset);
    if (b.languages !== undefined) cur.languages = parseRatedItems(b.languages);
    if (b.itSkills !== undefined) cur.itSkills = parseRatedItems(b.itSkills);
    if (b.sportsAndHobbies !== undefined) cur.sportsAndHobbies = parseRatedItems(b.sportsAndHobbies);
    if (b.education !== undefined) cur.education = parseEducationBio(b.education);
    if (b.internshipsTheses !== undefined) cur.internshipsTheses = parseInternships(b.internshipsTheses);
    if (b.experience !== undefined) cur.experience = parseExperienceBio(b.experience);
    if (b.keyHighlights !== undefined) cur.keyHighlights = parseStringArray(b.keyHighlights);
    if (b.declarationPlace !== undefined) cur.declarationPlace = trimStr(b.declarationPlace);
    if (b.declarationDate !== undefined && b.declarationDate) {
      cur.declarationDate = new Date(String(b.declarationDate));
    }
    if (b.signatureName !== undefined) cur.signatureName = trimStr(b.signatureName);
    user.biodata = cur as IBiodata;
    user.markModified("biodata");
  }

  if (studentInquiry !== undefined && studentInquiry && typeof studentInquiry === "object") {
    const s = studentInquiry as Record<string, unknown>;
    const cur: any = { ...(user.studentInquiry || {}) };
    if (s.gender !== undefined) {
      const g = parseGenderField(s.gender);
      if (g) cur.gender = g;
      else delete cur.gender;
    }
    if (s.sex !== undefined) {
      const sx = trimStr(s.sex);
      if (sx) cur.sex = sx;
      else delete cur.sex;
      if (s.gender === undefined) {
        const inferred = genderFromLegacySex(sx);
        if (inferred) cur.gender = inferred;
      }
    }
    if (s.familyMembers !== undefined) {
      cur.familyMembers = parseFamilyMembers(s.familyMembers);
      delete cur.familyDescription;
    } else if (s.familyDescription !== undefined) {
      cur.familyDescription = trimStr(s.familyDescription);
    }
    if (s.educationOverview !== undefined) cur.educationOverview = parseEducationOverview(s.educationOverview);
    if (s.motivationForFurtherStudies !== undefined) {
      cur.motivationForFurtherStudies = trimStr(s.motivationForFurtherStudies);
    }
    if (s.targetCountries !== undefined) cur.targetCountries = parseStringArray(s.targetCountries, 3);
    if (s.targetDegrees !== undefined) cur.targetDegrees = parseStringArray(s.targetDegrees);
    if (s.targetFieldsOfStudy !== undefined) cur.targetFieldsOfStudy = parseStringArray(s.targetFieldsOfStudy);
    if (s.englishTest !== undefined) cur.englishTest = parseEnglishTest(s.englishTest);
    if (s.additionalTestOrCertificate !== undefined) {
      cur.additionalTestOrCertificate = trimStr(s.additionalTestOrCertificate);
    }
    if (s.shortlistedUniversitiesList !== undefined) {
      cur.shortlistedUniversitiesList = parseStringArray(s.shortlistedUniversitiesList, 7);
    }
    if (s.inquiryComments !== undefined) cur.inquiryComments = parseStringArray(s.inquiryComments);
    if (s.inquiryAdditionalServices !== undefined) {
      cur.inquiryAdditionalServices = parseStringArray(s.inquiryAdditionalServices);
    }
    user.studentInquiry = cur as IStudentInquiry;
    user.markModified("studentInquiry");
  }
}
