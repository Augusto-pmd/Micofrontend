import { generateReservationId } from '../../src/utils/generateId';

describe('generateReservationId', () => {
  it('should have the format MC-XXXX-XXXX', () => {
    const id = generateReservationId();
    expect(id).toMatch(/^MC-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateReservationId()));
    expect(ids.size).toBe(100);
  });
});
