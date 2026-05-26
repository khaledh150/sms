export function formatStudentName(student: {
  nick_name?: string | null;
  first_name?: string;
  last_name?: string;
}): string {
  if (student.nick_name && student.first_name) {
    return `${student.nick_name} '${student.first_name}'`;
  }
  return student.nick_name || student.first_name || "";
}
