let count = 0;

export function incrementTestCounter(): number {
  count += 1;
  return count;
}

export function testCounter(): number {
  return count;
}