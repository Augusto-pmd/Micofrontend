import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
export const seedRouter = Router();

// ─── Real Nordelta data from Excel ────────────────────────────────────────────

// 54 contratos activos (BASE DE DATOS mi containe.xlsx)
const CONTRATOS = [
  { cto:'001',baulera:'A3-001',fecha:'10/3/2026',titular:'Pablo Kitay',dni:'20.568.460',tel:'11 3026-2711',m2:3.00,precio:88200 },
  { cto:'002',baulera:'A0-006',fecha:'10/3/2026',titular:'Ezequiel Ayanz',dni:'27.011.261',tel:'11 5124-6615',m2:15.00,precio:441000 },
  { cto:'003',baulera:'A2-025',fecha:'10/3/2026',titular:'PALCARE S.R.L.',dni:'30-71007281-3',tel:'-',m2:9.00,precio:207900 },
  { cto:'004',baulera:'A2-026',fecha:'10/3/2026',titular:'PALCARE S.R.L.',dni:'30-71007281-3',tel:'-',m2:9.00,precio:207900 },
  { cto:'005',baulera:'A2-027',fecha:'10/3/2026',titular:'PALCARE S.R.L.',dni:'30-71007281-3',tel:'-',m2:9.00,precio:207900 },
  { cto:'006',baulera:'A3-054',fecha:'10/3/2026',titular:'Ezequiel Ayanz',dni:'27.011.261',tel:'11 5124-6615',m2:5.10,precio:139230 },
  { cto:'007',baulera:'A3-014',fecha:'11/3/2026',titular:'Juan Francisco Barreto',dni:'22.798.609',tel:'11 5327-4352',m2:8.00,precio:204120 },
  { cto:'008',baulera:'A3-003',fecha:'16/3/2026',titular:'Leonardo Lucio Perrotta',dni:'11.433.704',tel:'11 6677-1835',m2:3.00,precio:88200 },
  { cto:'009',baulera:'A2-001',fecha:'17/3/2026',titular:'Pablo Esteban Bajuk Bohm',dni:'18.780.693',tel:'11 6970-5810',m2:8.00,precio:204120 },
  { cto:'010',baulera:'A2-002',fecha:'16/3/2026',titular:'FERRARA S.A / Felicitas Ferrara',dni:'30-70733736-9',tel:'11 5570-0002',m2:9.00,precio:207900 },
  { cto:'011',baulera:'A3-053',fecha:'17/3/2026',titular:'Maria Eugenia Tomasello',dni:'22.759.550',tel:'11 5750-6668',m2:5.10,precio:139230 },
  { cto:'012',baulera:'A1-007',fecha:'19/3/2026',titular:'Diego Ortiz / Cintia Rodriguez',dni:'28.338.343',tel:'11 7142-3400',m2:11.25,precio:259875 },
  { cto:'013',baulera:'A2-007',fecha:'25/3/2026',titular:'EXODO INFORMES SRL',dni:'30-71422582-7',tel:'11 6660-2254',m2:9.00,precio:207900 },
  { cto:'014',baulera:'A3-052',fecha:'25/3/2026',titular:'Gabriel Cubric',dni:'18.528.249',tel:'11 2257-7988',m2:5.10,precio:139230 },
  { cto:'015',baulera:'A1-008',fecha:'25/3/2026',titular:'Lucas Tamer',dni:'27.265.122',tel:'3814 01-4051',m2:11.25,precio:259875 },
  { cto:'016',baulera:'A0-005',fecha:'18/3/2026',titular:'TIP TUR',dni:'30-71102754-4',tel:'-',m2:15.00,precio:441000 },
  { cto:'017',baulera:'A1-001',fecha:'27/3/2026',titular:'Maximiliano Jalil',dni:'36.010.793',tel:'3413 11-9036',m2:13.50,precio:283500 },
  { cto:'018',baulera:'A3-056',fecha:'30/3/2026',titular:'Maximiliano Keglevich',dni:'24.655.483',tel:'11 4470-2515',m2:5.10,precio:139230 },
  { cto:'019',baulera:'A1-009',fecha:'30/3/2026',titular:'ARN Carolina Lourdes',dni:'27-27627095-3',tel:'11 3798-0196',m2:11.25,precio:259875 },
  { cto:'020',baulera:'A3-007',fecha:'31/3/2026',titular:'Laura Fernandez Castro',dni:'24.422.440',tel:'11 3517-4625',m2:3.00,precio:88200 },
  { cto:'021',baulera:'A3-008',fecha:'31/3/2026',titular:'Rosario Quijano',dni:'22.294.162',tel:'11 5619-7305',m2:3.00,precio:88200 },
  { cto:'022',baulera:'A3-009',fecha:'1/4/2026',titular:'Pablo Damonte',dni:'22.240.114',tel:'11 4400-2789',m2:3.00,precio:88200 },
  { cto:'023',baulera:'A3-006',fecha:'6/4/2026',titular:'Mateo Pagniez',dni:'41.067.347',tel:'11 6052-8201',m2:3.00,precio:88200 },
  { cto:'024',baulera:'A0-002',fecha:'6/4/2026',titular:'Matias Sebastian Blum',dni:'31.723.697',tel:'11 3929-5633',m2:15.00,precio:441000 },
  { cto:'025',baulera:'A3-004',fecha:'7/4/2026',titular:'Cecilia Pollola',dni:'18.005.826',tel:'11 6433-4303',m2:3.00,precio:88200 },
  { cto:'026',baulera:'A2-046',fecha:'10/4/2026',titular:'Gabriela D\'Agostino',dni:'17.968.902',tel:'11 4428-9275',m2:9.00,precio:207900 },
  { cto:'027',baulera:'A1-012',fecha:'14/4/2026',titular:'Sebastian Marra',dni:'-',tel:'11 3254-1706',m2:13.50,precio:283500 },
  { cto:'028',baulera:'A1-029',fecha:'17/4/2026',titular:'Felicitas Tissone',dni:'23.123.683',tel:'11 5101-4305',m2:13.50,precio:283500 },
  { cto:'029',baulera:'A1-030',fecha:'20/4/2026',titular:'Marcelo Dutto',dni:'20.009.040',tel:'11 5408-5298',m2:13.50,precio:283500 },
  { cto:'030',baulera:'A1-025',fecha:'17/4/2026',titular:'Nicolas Diaz Bobillo',dni:'34.519.284',tel:'11 5459-0897',m2:11.25,precio:259875 },
  { cto:'031',baulera:'A3-057',fecha:'22/4/2026',titular:'Santiago Moyano',dni:'25.646.522',tel:'11 4972-2104',m2:5.00,precio:139230 },
  { cto:'032',baulera:'A3-059',fecha:'22/4/2026',titular:'Veronica Curcija',dni:'24.229.097',tel:'11 4424-9053',m2:5.00,precio:139230 },
  { cto:'033',baulera:'A0-003',fecha:'22/4/2026',titular:'Rolando Marincovich',dni:'18.318.285',tel:'11 2746-7169',m2:15.00,precio:441000 },
  { cto:'034',baulera:'A1-028',fecha:'24/4/2026',titular:'Mtz Seguridad S.R.L.',dni:'30-71470338-9',tel:'11 6649-0433',m2:13.50,precio:283500 },
  { cto:'035',baulera:'A3-018',fecha:'24/4/2026',titular:'Paula Mac Loughlin',dni:'30.744.292',tel:'11 3363-7617',m2:1.50,precio:53550 },
  { cto:'036',baulera:'A3-005',fecha:'28/4/2026',titular:'Sebastian Nocito',dni:'24.228.143',tel:'11 3849-3951',m2:3.00,precio:88200 },
  { cto:'037',baulera:'A3-058',fecha:'29/4/2026',titular:'Carlos Juarez',dni:'22.362.082',tel:'11 4975-0879',m2:5.00,precio:139230 },
  { cto:'038',baulera:'A1-006',fecha:'29/4/2026',titular:'Debora Ruiz Sunico',dni:'14.012.608',tel:'11 2566-4434',m2:13.50,precio:283500 },
  { cto:'039',baulera:'A3-040',fecha:'30/4/2026',titular:'Carlos Juarez',dni:'22.362.082',tel:'11 4975-0879',m2:1.50,precio:53550 },
  { cto:'040',baulera:'A3-002',fecha:'30/4/2026',titular:'Ximena Etchart',dni:'28.752.372',tel:'1305 299-0242',m2:3.00,precio:88200 },
  { cto:'041',baulera:'A3-011',fecha:'30/4/2026',titular:'Daniel Piedra Buena',dni:'94.178.552',tel:'11 6911-4913',m2:3.00,precio:88200 },
  { cto:'042',baulera:'A3-012',fecha:'30/4/2026',titular:'Debora Ruiz Sunico',dni:'14.012.608',tel:'11 2566-4434',m2:3.00,precio:88200 },
  { cto:'043',baulera:'A2-009',fecha:'4/5/2026',titular:'Fernando Astudillo',dni:'24.563.590',tel:'11 4024-2125',m2:9.00,precio:207900 },
  { cto:'044',baulera:'A3-010',fecha:'7/5/2026',titular:'Ruben Alberto Sanchez',dni:'14.152.660',tel:'11 4164-6238',m2:3.00,precio:88200 },
  { cto:'045',baulera:'A3-060',fecha:'14/5/2026',titular:'Alicia Legaspi',dni:'18.122.053',tel:'11 3219-5206',m2:5.00,precio:139230 },
  { cto:'046',baulera:'A3-013',fecha:'16/5/2026',titular:'Pablo Salas',dni:'20.913.617',tel:'11 5706-1530',m2:3.00,precio:88200 },
  { cto:'047',baulera:'A1-026',fecha:'18/5/2026',titular:'Marcelo Cimas',dni:'26.273.570',tel:'11 4491-4350',m2:11.25,precio:259875 },
  { cto:'048',baulera:'A3-055',fecha:'20/5/2026',titular:'Eduardo Raul Scolari',dni:'13.466.755',tel:'11 6605-5284',m2:5.00,precio:139230 },
  { cto:'049',baulera:'A2-008',fecha:'20/5/2026',titular:'Hector Alejandro Logullo',dni:'16.322.734',tel:'11 4992-5892',m2:9.00,precio:207900 },
  { cto:'050',baulera:'A3-032',fecha:'21/5/2026',titular:'Karina Ana Perez',dni:'22.041.228',tel:'11 3103-3734',m2:2.00,precio:71400 },
  { cto:'051',baulera:'A1-021',fecha:'21/5/2026',titular:'Juan Ignacio Espina',dni:'36.637.425',tel:'11 2281-0033',m2:13.50,precio:283500 },
  { cto:'052',baulera:'A1-027',fecha:'23/5/2026',titular:'Claudia Cecilia Diker',dni:'17.363.894',tel:'11 5377-0452',m2:13.50,precio:283500 },
  { cto:'053',baulera:'A2-044',fecha:'26/5/2026',titular:'Claudia Patricia Manent',dni:'17.374.094',tel:'11 6218-0199',m2:9.00,precio:207900 },
  { cto:'054',baulera:'A2-034',fecha:'29/5/2026',titular:'Javier Cascasi',dni:'21.565.816',tel:'11 4022-7798',m2:9.00,precio:207900 },
];

// Emails reales (02 - BAULERAS ALQUILADAS.xlsx, col H)
const EMAIL_BY_CTO: Record<string, string> = {
  '001':'pkitay@gmail.com','002':'tusnackdelivery@gmail.com','003':'gf@palcare.com.ar',
  '004':'gf@palcare.com.ar','005':'gf@palcare.com.ar','006':'tusnackdelivery@gmail.com',
  '007':'panchobarreto1972@gmail.com','008':'leonardoperrotta_l@yahoo.com.ar',
  '009':'bajukpe@yahoo.com.ar','010':'feluf@live.com.ar','011':'marutomasello@gmail.com',
  '012':'analiarodri1986@gmail.com','013':'lopezg@exodoinformes.com',
  '014':'gabrielmcubric@hotmail.com','015':'ltproducciones@hotmail.com',
  '017':'rulolepra@hotmail.com','018':'keglevich@me.com','019':'bernardadeco@gmail.com',
  '020':'lauritafernandezc@gmail.com','021':'quijano.rosario@gmail.com',
  '022':'nypablodam@gmail.com','023':'mateopag98@gmail.com',
  '024':'blummatiassebastian@gmail.com','025':'cecipollola@hotmail.com',
  '026':'mgabrieladagostino@hotmail.com','027':'sebastian_m04@hotmail.com',
  '028':'feluss@gmail.com','029':'marcelo@mdnetworks.com.ar','030':'nicolasdbs@msn.com',
  '031':'sm@hernanmoyano.com','032':'mora_2310@yahoo.com.ar',
  '033':'rolandomarincovich@gmail.com','034':'danielrobol@inoutcontrol.com.ar',
  '035':'pcmacloughlin@gmail.com','036':'snocito@icloud.com',
  '037':'emergencias32@gmail.com','038':'deborasunico@gmail.com',
  '039':'emergencias32@gmail.com','040':'xime.etchart@gmail.com',
  '041':'daniel@piedrabuenapropiedades.com','042':'deborasunico@gmail.com',
  '043':'party2mil@hotmail.com','044':'ruben.sanchezperco@gmail.com',
  '045':'alicialegaspi1@gmail.com','046':'postscript.arg@gmail.com',
  '047':'marcecimas@hotmail.com.ar','048':'eduardoraulscolari@yahoo.es',
  '049':'alejandro_logullo@yahoo.com.ar','050':'arte_y_belleza@yahoo.com.ar',
  '051':'thehomeshop03@gmail.com','052':'cdiker@dydsi.com.ar',
  '053':'julietadeco18@gmail.com','054':'jcascasi@gmail.com',
};

// Precio por m2 (FACTURACION RESUMEN)
const PRICE_TABLE: Record<string, number> = {
  '1.50': 53550,  '2.00': 71400,   '3.00': 88200,
  '5.00': 139230, '5.10': 139230,  '6.00': 151200,
  '8.00': 204120, '8.10': 204120,  '9.00': 207900,
  '11.25': 259875,'13.50': 283500, '15.00': 441000,
  '16.00': 441000,
};

// Bauleras alquiladas (para marcarlas como occupied)
const ALQUILADAS = new Set(CONTRATOS.map(c => c.baulera));

// Layout completo de las 164 bauleras (por piso y rango)
function buildAllRooms(buildingId: string, branchId: string): any[] {
  const now = new Date().toISOString();
  const rooms: any[] = [];

  // PB / A0: 13 unidades de 15m² → A0-001 a A0-013
  for (let i = 1; i <= 13; i++) {
    const id = `A0-${String(i).padStart(3,'0')}`;
    rooms.push(makeRoom(id,'PB',15.00,buildingId,branchId,now));
  }
  // A1: 29 bauleras (mix 11.25 y 13.50)
  // A1-001 a A1-014 → 13.50m², A1-015 a A1-029 → alternating
  const a1Sizes: number[] = [
    13.50,13.50,13.50,13.50,13.50,13.50,13.50,13.50,13.50,13.50, // 001-010
    11.25,11.25,13.50,11.25,11.25,13.50,13.50,13.50,11.25,13.50, // 011-020
    13.50,13.50,13.50,11.25,11.25,11.25,13.50,13.50,13.50,       // 021-029
  ];
  for (let i = 0; i < 29; i++) {
    const id = `A1-${String(i+1).padStart(3,'0')}`;
    rooms.push(makeRoom(id,'1',a1Sizes[i]??13.50,buildingId,branchId,now));
  }
  // A1-030 bonus
  rooms.push(makeRoom('A1-030','1',13.50,buildingId,branchId,now));

  // A2: 49 bauleras (mix 8.1, 9.00)
  const a2Sizes: Record<string,number> = {
    'A2-001':8.10,'A2-002':9.00,'A2-003':9.00,'A2-004':9.00,'A2-005':9.00,
    'A2-006':9.00,'A2-007':9.00,'A2-008':9.00,'A2-009':9.00,'A2-010':9.00,
    'A2-011':9.00,'A2-012':9.00,'A2-013':9.00,'A2-014':9.00,'A2-015':9.00,
    'A2-016':9.00,'A2-017':9.00,'A2-018':9.00,'A2-019':9.00,'A2-020':9.00,
    'A2-021':9.00,'A2-022':9.00,'A2-023':9.00,'A2-024':9.00,'A2-025':9.00,
    'A2-026':9.00,'A2-027':9.00,'A2-028':9.00,'A2-029':9.00,'A2-030':9.00,
    'A2-031':9.00,'A2-032':9.00,'A2-033':9.00,'A2-034':9.00,'A2-035':9.00,
    'A2-036':9.00,'A2-037':9.00,'A2-038':9.00,'A2-039':9.00,'A2-040':9.00,
    'A2-041':9.00,'A2-042':9.00,'A2-043':9.00,'A2-044':9.00,'A2-045':9.00,
    'A2-046':9.00,'A2-047':8.10,'A2-048':8.10,
  };
  for (let i = 1; i <= 48; i++) {
    const id = `A2-${String(i).padStart(3,'0')}`;
    const sz = a2Sizes[id] ?? 9.00;
    rooms.push(makeRoom(id,'2',sz,buildingId,branchId,now));
  }

  // A3: 60 bauleras (mix 1.5, 2.0, 3.0, 5.0, 5.1, 8.0)
  const a3Sizes: Record<string,number> = {
    'A3-001':3.00,'A3-002':3.00,'A3-003':3.00,'A3-004':3.00,'A3-005':3.00,
    'A3-006':3.00,'A3-007':3.00,'A3-008':3.00,'A3-009':3.00,'A3-010':3.00,
    'A3-011':3.00,'A3-012':3.00,'A3-013':3.00,'A3-014':8.00,'A3-015':1.50,
    'A3-016':1.50,'A3-017':1.50,'A3-018':1.50,'A3-019':1.50,'A3-020':1.50,
    'A3-021':1.50,'A3-022':1.50,'A3-023':1.50,'A3-024':1.50,'A3-025':1.50,
    'A3-026':1.50,'A3-027':1.50,'A3-028':1.50,'A3-029':1.50,'A3-030':1.50,
    'A3-031':1.50,'A3-032':2.00,'A3-033':2.00,'A3-034':2.00,'A3-035':2.00,
    'A3-036':2.00,'A3-037':2.00,'A3-038':2.00,'A3-039':2.00,'A3-040':1.50,
    'A3-041':2.00,'A3-042':2.00,'A3-043':2.00,'A3-044':2.00,'A3-045':2.00,
    'A3-046':2.00,'A3-047':1.50,'A3-048':1.50,'A3-049':1.50,'A3-050':1.50,
    'A3-051':5.10,'A3-052':5.10,'A3-053':5.10,'A3-054':5.10,'A3-055':5.00,
    'A3-056':5.10,'A3-057':5.00,'A3-058':5.00,'A3-059':5.00,'A3-060':5.00,
  };
  for (let i = 1; i <= 60; i++) {
    const id = `A3-${String(i).padStart(3,'0')}`;
    const sz = a3Sizes[id] ?? 3.00;
    rooms.push(makeRoom(id,'3',sz,buildingId,branchId,now));
  }

  return rooms;
}

function makeRoom(id: string, floor: string, m2: number, buildingId: string, branchId: string, now: string) {
  const key = String(m2.toFixed(2));
  const price = PRICE_TABLE[key] ?? 88200;
  const isOccupied = ALQUILADAS.has(id);
  const contract = CONTRATOS.find(c => c.baulera === id);
  return {
    space: id,
    floor,
    width: String(m2),
    length: '2.50',
    height: '2.40',
    depth: '2.50',
    areaM2: String(m2),
    volumeM3: String((m2 * 2.4).toFixed(2)),
    price: String(price),
    images: [],
    status: isOccupied ? 'occupied' : 'available',
    description: `Baulera ${id} · ${m2}m²${contract ? ` · ${contract.titular}` : ''}`,
    buildingId,
    branchId,
    name: id,
    contractNumber: contract?.cto ?? null,
    currentTenant: contract?.titular ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function parseDate(str: string): string {
  // "10/3/2026" → "2026-03-10"
  const parts = str.split('/');
  if (parts.length !== 3) return str;
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

// DELETE /seed/clear
seedRouter.delete('/clear', async (_req: Request, res: Response) => {
  try {
    const collections = ['branches','buildings','storageRooms','reservationOrders','customers','operators','pricingRules','users'];
    const deleted: Record<string,number> = {};
    for (const col of collections) {
      const snapshot = await db.collection(col).get();
      const CHUNK = 490;
      const docs = snapshot.docs;
      for (let i = 0; i < docs.length; i += CHUNK) {
        const batch = db.batch();
        docs.slice(i,i+CHUNK).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      deleted[col] = docs.length;
    }
    res.json({ message:'All data cleared', deleted });
  } catch (err) {
    res.status(500).json({ message:'Internal server error', detail:String(err) });
  }
});

// POST /seed/nordelta — carga REAL de todos los datos de Nordelta
seedRouter.post('/nordelta', async (_req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();

    // ── 1. Branch ──────────────────────────────────────────────────
    const branchRef = db.collection('branches').doc('nordelta');
    await branchRef.set({
      name: 'Nordelta',
      address: 'Av. de los Lagos 7250',
      city: 'Nordelta - Tigre',
      province: 'Buenos Aires',
      country: 'Argentina',
      zipCode: '1670',
      phone: '+54 9 11 3620-7989',
      email: 'info@micontainer.com',
      isActive: true,
      description: 'Sucursal Nordelta · Edificio A · 164 bauleras',
      images: [],
      createdAt: now,
      updatedAt: now,
    });

    // ── 2. Building ────────────────────────────────────────────────
    const buildingRef = db.collection('buildings').doc('edificio-a');
    await buildingRef.set({
      name: 'Edificio A',
      branchId: 'nordelta',
      floors: 4,
      isActive: true,
      description: 'Edificio A · PB + Pisos 1, 2 y 3 · 164 bauleras',
      createdAt: now,
      updatedAt: now,
    });

    // ── 3. Storage rooms ───────────────────────────────────────────
    const rooms = buildAllRooms('edificio-a', 'nordelta');
    const CHUNK = 490;
    // Use baulera ID as document ID so it's idempotent
    for (let i = 0; i < rooms.length; i += CHUNK) {
      const batch = db.batch();
      rooms.slice(i,i+CHUNK).forEach(r => {
        const ref = db.collection('storageRooms').doc(r.space.replace('-','')); // e.g. A0001
        batch.set(ref, r);
      });
      await batch.commit();
    }

    // ── 4. Customers + Orders ──────────────────────────────────────
    // Deduplicate customers by DNI
    const customerMap = new Map<string, string>(); // dni → customerId
    const customerBatch = db.batch();

    // Build per-customer list of bauleras (some clients have multiple)
    const customerBauleras = new Map<string, {bauleras: string[], contracts: string[]}>();
    for (const c of CONTRATOS) {
      const key = c.dni;
      if (!customerBauleras.has(key)) customerBauleras.set(key, { bauleras:[], contracts:[] });
      customerBauleras.get(key)!.bauleras.push(c.baulera);
      customerBauleras.get(key)!.contracts.push(c.cto);
    }

    for (const c of CONTRATOS) {
      if (!customerMap.has(c.dni)) {
        const custId = `cust-${c.cto}`;
        customerMap.set(c.dni, custId);
        const parts = c.titular.split(' ');
        const firstName = parts[0] ?? c.titular;
        const lastName = parts.slice(1).join(' ');
        const info = customerBauleras.get(c.dni)!;
        const custRef = db.collection('customers').doc(custId);
        customerBatch.set(custRef, {
          firstName,
          lastName,
          fullName: c.titular,
          dni: c.dni,
          cuit: c.dni.includes('-') ? c.dni : null,
          personType: c.dni.includes('-') ? 'juridica' : 'fisica',
          phone: c.tel === '-' ? '' : c.tel,
          email: EMAIL_BY_CTO[c.cto] || '',
          address: '',
          branchId: 'nordelta',
          isActive: true,
          isApproved: true,
          // Link bidireccional: el cliente sabe sus bauleras
          bauleraCodigo: info.bauleras[0],         // baulera principal
          bauleras: info.bauleras,                  // todas las bauleras (si tiene varias)
          storageRoomId: info.bauleras[0].replace('-',''),
          contractNumber: info.contracts[0],
          contractNumbers: info.contracts,
          startDate: parseDate(c.fecha),
          monthlyPrice: c.precio,
          m2: c.m2,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    await customerBatch.commit();

    // Orders (one per contract)
    const orderBatch = db.batch();
    for (const c of CONTRATOS) {
      const customerId = customerMap.get(c.dni)!;
      const storageRoomId = c.baulera.replace('-','');
      const orderRef = db.collection('reservationOrders').doc(`order-${c.cto}`);
      orderBatch.set(orderRef, {
        contractNumber: c.cto,
        customerId,
        customerName: c.titular,
        storageRoomId,
        bauleraCodigo: c.baulera,
        branchId: 'nordelta',
        buildingId: 'edificio-a',
        entryDate: parseDate(c.fecha),
        m2: c.m2,
        monthlyPrice: c.precio,
        totalAmount: String(c.precio),
        status: 'CONFIRMED',
        source: 'manual',
        notes: '',
        createdAt: now,
        updatedAt: now,
      });
    }
    await orderBatch.commit();

    // ── 5. Pricing rules ───────────────────────────────────────────
    const pricingBatch = db.batch();
    const pricingRules = Object.entries(PRICE_TABLE).map(([m2, price]) => ({
      branchId: 'nordelta',
      m2: parseFloat(m2),
      pricePerMonth: price,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }));
    // Deduplicate by m2
    const seenM2 = new Set<number>();
    for (const rule of pricingRules) {
      if (!seenM2.has(rule.m2)) {
        seenM2.add(rule.m2);
        const ref = db.collection('pricingRules').doc(`nordelta-${rule.m2}`);
        pricingBatch.set(ref, rule);
      }
    }
    await pricingBatch.commit();

    res.json({
      message: '✅ Nordelta data loaded successfully',
      seeded: {
        branches: 1,
        buildings: 1,
        storageRooms: rooms.length,
        customers: customerMap.size,
        orders: CONTRATOS.length,
        pricingRules: seenM2.size,
      },
    });
  } catch (err) {
    console.error('POST /seed/nordelta error:', err);
    res.status(500).json({ message:'Internal server error', detail:String(err) });
  }
});

// POST /seed/initial (backwards compat)
seedRouter.post('/initial', async (_req: Request, res: Response) => {
  res.json({ message:'Use POST /seed/nordelta for real data' });
});
