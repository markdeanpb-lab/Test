// Name, nationality and hometown generation. Pools are combined (first x surname, plus generated
// syllabic surnames) so a universe can run for centuries without exhausting identities.
import type { Rng } from './rng';

interface NatDef { code: string; name: string; adj: string; flag: string; m: string[]; f: string[]; last: string[]; towns: string[]; syll?: string[][] }

const N: NatDef[] = [
  { code: 'GBR', name: 'Great Britain', adj: 'British', flag: '🇬🇧',
    m: ['Arthur', 'Albert', 'Alfred', 'Bernard', 'Cecil', 'Charles', 'Clive', 'Colin', 'Cyril', 'David', 'Derek', 'Donald', 'Edward', 'Ernest', 'Frank', 'Frederick', 'Geoffrey', 'George', 'Gerald', 'Gordon', 'Graham', 'Harold', 'Henry', 'Herbert', 'Hugh', 'Ian', 'Jack', 'James', 'John', 'Keith', 'Kenneth', 'Leonard', 'Lionel', 'Malcolm', 'Martin', 'Maurice', 'Michael', 'Neil', 'Nigel', 'Oliver', 'Owen', 'Percy', 'Peter', 'Philip', 'Raymond', 'Reginald', 'Richard', 'Robert', 'Roger', 'Ronald', 'Rupert', 'Samuel', 'Simon', 'Stanley', 'Stuart', 'Thomas', 'Walter', 'William', 'Alfie', 'Callum', 'Connor', 'Daniel', 'Ethan', 'Finley', 'Harry', 'Harvey', 'Isaac', 'Jake', 'Joshua', 'Kieran', 'Leo', 'Lewis', 'Liam', 'Luke', 'Max', 'Nathan', 'Noah', 'Reuben', 'Ryan', 'Theo', 'Toby', 'Zach', 'Rhys', 'Aled', 'Euan', 'Fraser', 'Hamish', 'Rory', 'Declan', 'Arjun', 'Rohan', 'Kwame', 'Tariq'],
    f: ['Ada', 'Agnes', 'Alice', 'Beatrice', 'Dorothy', 'Edith', 'Eleanor', 'Elsie', 'Evelyn', 'Florence', 'Gladys', 'Grace', 'Hilda', 'Irene', 'Ivy', 'Joan', 'Kathleen', 'Kay', 'Mabel', 'Margaret', 'Marjorie', 'Mary', 'Muriel', 'Phyllis', 'Rose', 'Violet', 'Winifred', 'Ann', 'Carol', 'Diana', 'Gillian', 'Helen', 'Jane', 'Janet', 'Judith', 'Linda', 'Pamela', 'Patricia', 'Sarah', 'Susan', 'Abigail', 'Amelia', 'Charlotte', 'Chloe', 'Eliza', 'Emily', 'Freya', 'Georgia', 'Hannah', 'Imogen', 'Isla', 'Jessica', 'Lily', 'Lucy', 'Maisie', 'Megan', 'Molly', 'Olivia', 'Phoebe', 'Poppy', 'Rosie', 'Sophie', 'Zara', 'Ffion', 'Morag', 'Niamh', 'Priya', 'Aaliyah', 'Esme'],
    last: ['Ashby', 'Ashworth', 'Barclay', 'Barrington', 'Beaumont', 'Bennett', 'Blackwood', 'Bramley', 'Brooke', 'Carrington', 'Chalmers', 'Chapman', 'Clarke', 'Collins', 'Crawley', 'Cresswell', 'Dalton', 'Davenport', 'Drummond', 'Ellison', 'Everett', 'Fairfax', 'Fenwick', 'Fletcher', 'Forsyth', 'Gainsford', 'Gilbert', 'Goodwin', 'Granger', 'Hadley', 'Hallam', 'Harcourt', 'Tamati', 'Hawthorne', 'Heywood', 'Holloway', 'Hughes', 'Kendrick', 'Kingsley', 'Lambert', 'Langley', 'Lockwood', 'Marlow', 'Mercer', 'Merriman', 'Morrow', 'Newbury', 'Oakley', 'Osborne', 'Pemberton', 'Pennington', 'Prescott', 'Radcliffe', 'Ramsay', 'Redfern', 'Ridley', 'Rowntree', 'Sallows', 'Seymour', 'Shaw', 'Sinclair', 'Somerville', 'Stanhope', 'Sutton', 'Talbot', 'Thornton', 'Tolley', 'Underwood', 'Vance', 'Wainwright', 'Walsingham', 'Wetherby', 'Whitaker', 'Whitmore', 'Willoughby', 'Winslow', 'Wyatt', 'Yardley', 'Abbott', 'Birch', 'Cole', 'Doyle', 'Ellis', 'Finch', 'Grant', 'Hale', 'Jarvis', 'Knight', 'Lowe', 'Marsh', 'Nash', 'Pike', 'Quinn', 'Reeve', 'Stone', 'Tate', 'Vaughan', 'Webb', 'Young', 'Shah', 'Patel', 'Okafor', 'Mensah', 'Chowdhury', 'Evans', 'Morgan', 'Price', 'MacLeod', 'Fraser', 'Munro', 'Crane', 'Fawcett', 'Gresham', 'Latimer', 'Pelham', 'Sopwith', 'Tennant'],
    towns: ['St Albans', 'St Albans', 'St Albans', 'Harpenden', 'Hatfield', 'Watford', 'Hemel Hempstead', 'Welwyn', 'Hitchin', 'Stevenage', 'Hertford', 'Ware', 'Berkhamsted', 'Tring', 'Radlett', 'Redbourn', 'Wheathampstead', 'London Colney', 'Luton', 'London', 'London', 'London', 'Birmingham', 'Manchester', 'Leeds', 'Bristol', 'Glasgow', 'Edinburgh', 'Cardiff', 'Belfast', 'Norwich', 'Oxford', 'Cambridge', 'Brighton', 'Coventry', 'Sheffield', 'Nottingham', 'Leicester', 'Southampton', 'Plymouth', 'York', 'Bath', 'Northampton', 'Milton Keynes', 'Swansea', 'Aberdeen', 'Newcastle', 'Liverpool', 'Guildford', 'Reading'] },
  { code: 'IRL', name: 'Ireland', adj: 'Irish', flag: '🇮🇪', m: ['Aidan', 'Brendan', 'Cathal', 'Ciaran', 'Colm', 'Conor', 'Cormac', 'Darragh', 'Donal', 'Eamon', 'Fergal', 'Finbar', 'Kieran', 'Niall', 'Padraig', 'Ronan', 'Seamus', 'Sean', 'Tadhg', 'Oisin'], f: ['Aoife', 'Bridget', 'Caitlin', 'Ciara', 'Deirdre', 'Eileen', 'Grainne', 'Maeve', 'Niamh', 'Orla', 'Roisin', 'Siobhan', 'Sinead', 'Clodagh'], last: ['Brennan', 'Byrne', 'Callaghan', 'Donnelly', 'Doyle', 'Fitzgerald', 'Gallagher', 'Kavanagh', 'Keane', 'Lynch', 'McCarthy', 'Moloney', 'Nolan', 'O\'Brien', 'O\'Connell', 'O\'Neill', 'O\'Sullivan', 'Quigley', 'Regan', 'Sheehan', 'Walsh'], towns: ['Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford', 'Kilkenny', 'Sligo', 'Wexford'] },
  { code: 'FRA', name: 'France', adj: 'French', flag: '🇫🇷', m: ['Alain', 'André', 'Antoine', 'Bernard', 'Christophe', 'Émile', 'Étienne', 'François', 'Georges', 'Gérard', 'Henri', 'Jacques', 'Jean', 'Julien', 'Laurent', 'Louis', 'Luc', 'Marcel', 'Maurice', 'Olivier', 'Pascal', 'Philippe', 'Pierre', 'René', 'Robert', 'Thierry', 'Yves', 'Hugo', 'Théo', 'Mathis', 'Lucas', 'Raphaël'], f: ['Amélie', 'Anne', 'Camille', 'Céline', 'Claire', 'Colette', 'Élise', 'Hélène', 'Isabelle', 'Juliette', 'Louise', 'Manon', 'Marie', 'Mathilde', 'Nathalie', 'Odette', 'Simone', 'Sophie', 'Yvonne', 'Chloé', 'Léa', 'Inès'], last: ['Brunet', 'Aubert', 'Beaumont', 'Bertrand', 'Blanchard', 'Bonnet', 'Chevalier', 'Grimaldi-Rey', 'Delorme', 'Dubois', 'Dumont', 'Durand', 'Fontaine', 'Garnier', 'Girard', 'Lemaire', 'Laurent', 'Aubry', 'Lefèvre', 'Marchand', 'Mercier', 'Moreau', 'Perrin', 'Renaud', 'Rousseau', 'Tessier', 'Vidal', 'Roussel', 'Lautrec', 'Caron'], towns: ['Paris', 'Lyon', 'Marseille', 'Reims', 'Le Mans', 'Nice', 'Bordeaux', 'Toulouse', 'Rouen', 'Dijon', 'Lille', 'Nantes', 'Clermont-Ferrand'] },
  { code: 'ITA', name: 'Italy', adj: 'Italian', flag: '🇮🇹', m: ['Alberto', 'Alessandro', 'Andrea', 'Antonio', 'Carlo', 'Enzo', 'Fabio', 'Federico', 'Franco', 'Giacomo', 'Giancarlo', 'Giorgio', 'Giovanni', 'Giuseppe', 'Luca', 'Luigi', 'Marco', 'Mario', 'Massimo', 'Nicola', 'Paolo', 'Pietro', 'Riccardo', 'Roberto', 'Stefano', 'Vittorio', 'Lorenzo', 'Matteo'], f: ['Alessandra', 'Anna', 'Beatrice', 'Carla', 'Chiara', 'Elena', 'Francesca', 'Giulia', 'Isabella', 'Laura', 'Lucia', 'Maria', 'Paola', 'Silvia', 'Sofia', 'Valentina', 'Martina'], last: ['Alberti', 'Barbieri', 'Bellini', 'Benedetti', 'Bianchi', 'Sala', 'Colombo', 'Conti', 'Costa', 'De Luca', 'Fabbri', 'Negri', 'Ferrara', 'Galli', 'Gatti', 'Lombardi', 'Marino', 'Moretti', 'Pellegrini', 'Rinaldi', 'Romano', 'Rossi', 'Santoro', 'Cattaneo', 'Ferri', 'Villa', 'Zanetti'], towns: ['Milan', 'Turin', 'Modena', 'Bologna', 'Rome', 'Florence', 'Naples', 'Monza', 'Maranello', 'Genoa', 'Brescia', 'Parma', 'Verona'] },
  { code: 'GER', name: 'Germany', adj: 'German', flag: '🇩🇪', m: ['Albrecht', 'Bernd', 'Christian', 'Dieter', 'Ernst', 'Friedrich', 'Günther', 'Hans', 'Heinrich', 'Helmut', 'Hermann', 'Jürgen', 'Karl', 'Klaus', 'Kurt', 'Manfred', 'Michael', 'Nico', 'Otto', 'Ralf', 'Rudolf', 'Sebastian', 'Stefan', 'Uwe', 'Werner', 'Wolfgang', 'Jonas', 'Leon', 'Finn'], f: ['Anja', 'Birgit', 'Claudia', 'Elke', 'Erika', 'Gisela', 'Greta', 'Hanna', 'Heike', 'Ilse', 'Katrin', 'Lena', 'Monika', 'Petra', 'Sabine', 'Ursula', 'Mia', 'Emma'], last: ['Bauer', 'Becker', 'Brandt', 'Kessler', 'Engel', 'Fischer', 'Hartmann', 'Hoffmann', 'Keller', 'Klein', 'Köhler', 'Krause', 'Lang', 'Lehmann', 'Meyer', 'Neumann', 'Richter', 'Schäfer', 'Schmidt', 'Schneider', 'Schulz', 'Brenner', 'Vogel', 'Wagner', 'Weber', 'Winkler', 'Wolf', 'Zimmermann'], towns: ['Stuttgart', 'Munich', 'Berlin', 'Hamburg', 'Cologne', 'Frankfurt', 'Nuremberg', 'Hanover', 'Dresden', 'Leipzig', 'Düsseldorf', 'Kerpen'] },
  { code: 'BEL', name: 'Belgium', adj: 'Belgian', flag: '🇧🇪', m: ['Arnaud', 'Baudouin', 'Didier', 'Eric', 'Guy', 'Lucien', 'Olivier', 'Paul', 'Thierry', 'Wim', 'Maxime'], f: ['Annick', 'Marie', 'Sophie', 'Lotte', 'Elise', 'Nathalie'], last: ['Claes', 'De Smet', 'Dubois', 'Goossens', 'Janssens', 'Lambert', 'Maes', 'Peeters', 'Wouters', 'Verhaegen', 'Bianchi', 'Dewaele'], towns: ['Brussels', 'Liège', 'Antwerp', 'Ghent', 'Spa', 'Namur', 'Bruges'] },
  { code: 'NED', name: 'Netherlands', adj: 'Dutch', flag: '🇳🇱', m: ['Bram', 'Daan', 'Gijs', 'Jan', 'Jos', 'Kees', 'Maarten', 'Pieter', 'Ruud', 'Sem', 'Thijs', 'Wim'], f: ['Anouk', 'Femke', 'Lieke', 'Marloes', 'Sanne', 'Tess', 'Eva'], last: ['Bakker', 'de Boer', 'de Graaf', 'Dekker', 'Jansen', 'Mulder', 'Smit', 'van Dijk', 'van Leeuwen', 'Visser', 'de Vries', 'Verbeek'], towns: ['Amsterdam', 'Rotterdam', 'Utrecht', 'Zandvoort', 'Eindhoven', 'Groningen', 'Hasselt'] },
  { code: 'SUI', name: 'Switzerland', adj: 'Swiss', flag: '🇨🇭', m: ['Beat', 'Jo', 'Marc', 'Peter', 'Reto', 'Sébastien', 'Urs', 'Nico'], f: ['Anna', 'Nadia', 'Simona', 'Lara'], last: ['Baumann', 'Frei', 'Gerber', 'Huber', 'Keller', 'Meier', 'Müller', 'Rüegg', 'Bernasconi', 'Wyss'], towns: ['Zürich', 'Geneva', 'Basel', 'Bern', 'Lausanne', 'Lugano', 'Fribourg'] },
  { code: 'ESP', name: 'Spain', adj: 'Spanish', flag: '🇪🇸', m: ['Alejandro', 'Antonio', 'Carlos', 'Diego', 'Fernando', 'Javier', 'Jorge', 'José', 'Juan', 'Luis', 'Manuel', 'Miguel', 'Pablo', 'Pedro', 'Sergio'], f: ['Ana', 'Carmen', 'Elena', 'Isabel', 'Lucía', 'María', 'Marta', 'Paula', 'Sara'], last: ['Cabrera', 'Castillo', 'Delgado', 'Fernández', 'García', 'Gómez', 'Herrera', 'López', 'Martínez', 'Morales', 'Navarro', 'Ortega', 'Ruiz', 'Vidal', 'Serrano', 'Torres'], towns: ['Madrid', 'Barcelona', 'Valencia', 'Seville', 'Oviedo', 'Bilbao', 'Zaragoza', 'Jerez'] },
  { code: 'AUT', name: 'Austria', adj: 'Austrian', flag: '🇦🇹', m: ['Alexander', 'Gerhard', 'Karl', 'Christian', 'Markus', 'Lukas'], f: ['Anna', 'Katharina', 'Theresa', 'Lisa'], last: ['Berger', 'Gruber', 'Huber', 'Eder', 'Mayer', 'Pichler', 'Steiner', 'Moser', 'Hofer'], towns: ['Vienna', 'Graz', 'Salzburg', 'Linz', 'Innsbruck'] },
  { code: 'SWE', name: 'Sweden', adj: 'Swedish', flag: '🇸🇪', m: ['Anders', 'Björn', 'Erik', 'Gunnar', 'Jonas', 'Lars', 'Magnus', 'Mattias', 'Nils', 'Stefan'], f: ['Astrid', 'Elin', 'Ingrid', 'Karin', 'Linnea', 'Maja'], last: ['Andersson', 'Bergström', 'Ekström', 'Johansson', 'Karlsson', 'Lindqvist', 'Nilsson', 'Lundgren', 'Sjöberg', 'Holmberg'], towns: ['Stockholm', 'Gothenburg', 'Malmö', 'Uppsala', 'Örebro'] },
  { code: 'FIN', name: 'Finland', adj: 'Finnish', flag: '🇫🇮', m: ['Aki', 'Eero'], f: ['Aino', 'Emilia', 'Helmi', 'Saara'], last: ['Heikkilä', 'Lahtinen', 'Salonen', 'Laine', 'Lehtinen', 'Rantanen', 'Nieminen', 'Koskinen', 'Virtanen'], towns: ['Helsinki', 'Espoo', 'Tampere', 'Turku', 'Oulu'] },
  { code: 'DEN', name: 'Denmark', adj: 'Danish', flag: '🇩🇰', m: ['Anders', 'Christian', 'Jan', 'Kevin', 'Mads', 'Tom'], f: ['Freja', 'Ida', 'Karen', 'Signe'], last: ['Hansen', 'Jensen', 'Larsen', 'Sørensen', 'Nielsen', 'Rasmussen'], towns: ['Copenhagen', 'Aarhus', 'Odense', 'Roskilde'] },
  { code: 'USA', name: 'United States', adj: 'American', flag: '🇺🇸', m: ['Bill', 'Bob', 'Carl', 'Chuck', 'Dan', 'Eddie', 'Harry', 'Jim', 'Joe', 'Mario', 'Mike', 'Phil', 'Richie', 'Scott', 'Tony', 'Walt', 'Tyler', 'Logan', 'Jackson', 'Colton'], f: ['Betty', 'Dorothy', 'Janet', 'Katherine', 'Lyn', 'Sarah', 'Madison', 'Ashley', 'Taylor'], last: ['Delaney', 'Baker', 'Collins', 'Cunningham', 'Garrison', 'Holt', 'Hayes', 'Hill', 'Johnson', 'Miller', 'Parsons', 'Lowell', 'Mahoney', 'Sullivan', 'Kincaid', 'Walker', 'Ward', 'Wilson'], towns: ['Indianapolis', 'Los Angeles', 'Detroit', 'Chicago', 'New York', 'Houston', 'Atlanta', 'Charlotte', 'Phoenix', 'Boston', 'Denver'] },
  { code: 'CAN', name: 'Canada', adj: 'Canadian', flag: '🇨🇦', m: ['Jacques', 'Nicholas', 'Paul', 'Scott', 'Robert'], f: ['Emma', 'Claire', 'Megan', 'Chantal'], last: ['Campbell', 'Fournier', 'Gagnon', 'Bouchard', 'MacDonald', 'Tremblay', 'Lachance', 'Wilson'], towns: ['Montreal', 'Toronto', 'Vancouver', 'Calgary', 'Quebec City'] },
  { code: 'ARG', name: 'Argentina', adj: 'Argentine', flag: '🇦🇷', m: ['Carlos', 'José', 'Juan', 'Oscar', 'Ricardo', 'Franco', 'Agustín'], f: ['Lucía', 'Martina', 'Valentina', 'Camila'], last: ['Aguirre', 'González', 'Ibarra', 'Pérez', 'Salvatierra', 'Rodríguez', 'Quiroga', 'Echeverría'], towns: ['Buenos Aires', 'Balcarce', 'Córdoba', 'Rosario', 'Mendoza'] },
  { code: 'BRA', name: 'Brazil', adj: 'Brazilian', flag: '🇧🇷', m: ['Felipe', 'Carlos', 'Gabriel', 'Enzo', 'Lucas'], f: ['Ana', 'Beatriz', 'Bianca', 'Camila', 'Larissa'], last: ['Barbosa', 'Carvalho', 'Costa', 'Andrade', 'Moreno', 'Oliveira', 'Teixeira', 'Santos', 'Silva', 'Souza'], towns: ['São Paulo', 'Rio de Janeiro', 'Curitiba', 'Brasília', 'Porto Alegre'] },
  { code: 'AUS', name: 'Australia', adj: 'Australian', flag: '🇦🇺', m: ['Alan', 'Daniel', 'Jack', 'Mark', 'Oscar', 'Tim', 'Will', 'Cooper'], f: ['Chloe', 'Emily', 'Isla', 'Matilda', 'Ruby'], last: ['Callister', 'Tulloch', 'Jones', 'Kennedy', 'Harwood', 'Lindsay', 'Stewart', 'Prowse'], towns: ['Sydney', 'Melbourne', 'Adelaide', 'Perth', 'Brisbane', 'Hobart'] },
  { code: 'NZL', name: 'New Zealand', adj: 'New Zealander', flag: '🇳🇿', m: ['Bruce', 'Chris', 'Liam', 'Nick'], f: ['Kiri', 'Aroha', 'Hannah'], last: ['Pritchard', 'Tamati', 'Ngata', 'Kereama', 'Rewiti', 'Moana'], towns: ['Auckland', 'Wellington', 'Christchurch', 'Hamilton'] },
  { code: 'RSA', name: 'South Africa', adj: 'South African', flag: '🇿🇦', m: ['Tony', 'Dave', 'Sipho', 'Thabo'], f: ['Naledi', 'Zanele', 'Lerato'], last: ['Botha', 'Pretorius', 'Mokoena', 'Nkosi', 'van der Merwe', 'Dlamini'], towns: ['Johannesburg', 'Cape Town', 'Durban', 'East London', 'Pretoria'] },
  { code: 'JPN', name: 'Japan', adj: 'Japanese', flag: '🇯🇵', m: ['Hiroshi', 'Kazuki', 'Satoru', 'Takuma', 'Yuki', 'Ren', 'Haruto'], f: ['Aiko', 'Hana', 'Sakura', 'Yui', 'Mei'], last: ['Hayashi', 'Mori', 'Sato', 'Suzuki', 'Tanaka', 'Kimura', 'Yamamoto', 'Ito'], towns: ['Tokyo', 'Osaka', 'Nagoya', 'Suzuka', 'Yokohama', 'Sapporo'] },
  { code: 'MEX', name: 'Mexico', adj: 'Mexican', flag: '🇲🇽', m: ['Esteban', 'Pedro', 'Ricardo', 'Rafael', 'Héctor', 'Emilio'], f: ['Ximena', 'Daniela', 'Regina'], last: ['Villalobos', 'Pérez', 'Rodríguez', 'Cárdenas', 'Hernández'], towns: ['Mexico City', 'Guadalajara', 'Monterrey', 'Puebla'] },
  { code: 'POL', name: 'Poland', adj: 'Polish', flag: '🇵🇱', m: ['Robert', 'Jakub', 'Kacper', 'Tomasz'], f: ['Zofia', 'Maja', 'Julia'], last: ['Kowalski', 'Zieliński', 'Nowak', 'Wiśniewski'], towns: ['Kraków', 'Warsaw', 'Gdańsk', 'Wrocław'] },
  { code: 'IND', name: 'India', adj: 'Indian', flag: '🇮🇳', m: ['Arjun', 'Rohan'], f: ['Ananya', 'Priya', 'Mira', 'Isha'], last: ['Iyer', 'Menon', 'Nair', 'Kapoor', 'Sharma', 'Rao'], towns: ['Chennai', 'Mumbai', 'Bangalore', 'Delhi', 'Coimbatore'] },
  { code: 'CHN', name: 'China', adj: 'Chinese', flag: '🇨🇳', m: ['Wei', 'Jun', 'Hao', 'Yifei'], f: ['Mei', 'Lin', 'Xiu', 'Yan'], last: ['Liu', 'Wang', 'Li', 'Chen', 'Ma'], towns: ['Shanghai', 'Beijing', 'Shenzhen', 'Guangzhou'] },
  { code: 'MON', name: 'Monaco', adj: 'Monegasque', flag: '🇲🇨', m: ['Louis', 'Charles', 'Olivier', 'Arthur'], f: ['Grace', 'Stéphanie'], last: ['Grimaldi-Rey', 'Rinaldi', 'Aubry', 'Rossi'], towns: ['Monte Carlo'] },
];

// Syllables for generated surnames when pools run thin (keeps identities fresh indefinitely).
const SYLL: Record<string, string[][]> = {
  GBR: [['Ash', 'Brad', 'Craw', 'Dun', 'Elm', 'Fair', 'Gold', 'Hart', 'Kings', 'Lang', 'Mar', 'North', 'Oak', 'Pen', 'Ros', 'Stan', 'Thorn', 'Wal', 'Wood', 'Brom'], ['ley', 'ford', 'field', 'ham', 'ton', 'wick', 'more', 'worth', 'bury', 'well', 'dale', 'combe', 'stead', 'by', 'shaw']],
  default: [['Al', 'Ber', 'Cor', 'Dal', 'Fel', 'Gar', 'Lor', 'Mar', 'Nor', 'Ros', 'Tal', 'Val', 'Ven', 'Dor'], ['ani', 'ero', 'enz', 'ard', 'ino', 'eau', 'ing', 'sen', 'ova', 'elli', 'ez', 'ard', 'ier']],
};

export const NATIONS: Record<string, { name: string; adj: string; flag: string }> = Object.fromEntries(N.map((n) => [n.code, { name: n.name, adj: n.adj, flag: n.flag }]));
const byCode = Object.fromEntries(N.map((n) => [n.code, n]));

/** Era-dependent nationality weights: British-dominated early grids broaden into a global field. */
export function pickNationality(rng: Rng, year: number): string {
  const t = Math.max(0, Math.min(1, (year - 1926) / 90));
  const w: Record<string, number> = {
    GBR: 60 - 38 * t, IRL: 3, FRA: 9, ITA: 8, GER: 6 + 2 * t, BEL: 3, NED: 1 + 2 * t, SUI: 2, ESP: 1 + 3 * t, AUT: 1 + 1.5 * t, SWE: 1 + 1.5 * t, FIN: 0.3 + 2 * t, DEN: 0.3 + 1 * t,
    USA: 2 + 3 * t, CAN: 0.5 + 1.5 * t, ARG: 0.5 + 2 * t, BRA: 0.2 + 3 * t, AUS: 0.5 + 2.5 * t, NZL: 0.2 + 1.2 * t, RSA: 0.2 + 1 * t, JPN: 3 * t * t, MEX: 1.2 * t, POL: 0.8 * t, IND: 1.5 * t * t, CHN: 2 * t * t, MON: 0.5,
  };
  const keys = Object.keys(w);
  return rng.weighted(keys, keys.map((k) => w[k]));
}

export function femaleShare(year: number): number {
  if (year < 1950) return 0.035;
  if (year < 1990) return 0.035 + (year - 1950) * 0.0015;
  return Math.min(0.42, 0.095 + (year - 1990) * 0.0045);
}

export function genName(rng: Rng, nat: string, gender: 'm' | 'f', taken: Set<string>, forcedLast?: string): { first: string; last: string } {
  const n = byCode[nat] ?? byCode.GBR;
  for (let tries = 0; tries < 40; tries++) {
    const first = rng.pick(gender === 'f' ? n.f : n.m);
    let last = forcedLast ?? rng.pick(n.last);
    if (!forcedLast && tries > 12) { const syl = SYLL[nat] ?? SYLL.default; last = rng.pick(syl[0]) + rng.pick(syl[1]); }
    const key = `${first} ${last}`;
    if (!taken.has(key)) { taken.add(key); return { first, last }; }
  }
  // fall back to a middle initial to keep names distinct
  const first = rng.pick(gender === 'f' ? n.f : n.m), last = forcedLast ?? rng.pick(n.last);
  const alt = `${first} ${String.fromCharCode(65 + rng.int(26))}. ${last}`;
  taken.add(alt);
  return { first: alt.split(' ').slice(0, 2).join(' '), last };
}

export function pickTown(rng: Rng, nat: string): string { const n = byCode[nat] ?? byCode.GBR; return rng.pick(n.towns); }

export function driverCode(last: string, taken: Set<string>): string {
  const clean = last.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase();
  let c = (clean + 'XXX').slice(0, 3);
  if (!taken.has(c)) { taken.add(c); return c; }
  for (let i = 3; i < clean.length; i++) { c = clean.slice(0, 2) + clean[i]; if (!taken.has(c)) { taken.add(c); return c; } }
  for (let i = 0; i < 26; i++) { c = clean.slice(0, 2) + String.fromCharCode(65 + i); if (!taken.has(c)) { taken.add(c); return c; } }
  return clean.slice(0, 3);
}

// ------------------------------------------------------------------ teams & sponsors
export const TEAM_ROOTS = ['Alban', 'Verulam', 'Holywell', 'Kingsbury', 'Sopwell', 'Pelham', 'Marford', 'Redbourn', 'Colney', 'Batchwood', 'Hertford', 'Chiltern', 'Ver Valley', 'Gorhambury', 'Fleetville', 'Bernards Heath', 'Harpenden', 'Watling', 'Mimram', 'Ashridge', 'Wheathamp', 'Aldenham', 'Lea Valley', 'Brickett', 'Townsend', 'Oaklands', 'Prae Wood', 'Beech Bottom', 'Shenley', 'Knebworth'];
export const TEAM_FORMS = ['{r} Motors', '{r} Racing', '{r} Engineering', '{r} & {s}', '{s} {r}', '{r} Motor Company', 'Équipe {s}', 'Scuderia {s}', '{s} Automobiles', '{s} Racing Team', '{r} Speedworks', '{s} Werke', '{r} Grand Prix', 'Team {r}'];
export const SPONSOR_SECTORS: [string, string[]][] = [
  ['oil', ['Castleford Oils', 'Regent Petroleum', 'Veritas Lubricants', 'Northern Star Fuel', 'Albion Motor Spirit', 'Delta Oil']],
  ['tobacco', ['Marquis Tobacco', 'Crown Cigarettes', 'Silk Cut Leaf', 'Gold Leaf Virginia']],
  ['drinks', ['Hertford Ales', 'Verulam Brewery', 'Sparkle Cola', 'Highland Malt', 'Red Stag Energy']],
  ['finance', ['Chequer Street Bank', 'Abbey Mutual', 'Clocktower Assurance', 'Meridian Capital', 'Vantage Finance']],
  ['technology', ['Holloway Electronics', 'Vertex Computing', 'Nimbus Telecom', 'Quantum Grid', 'Lumen Systems', 'Orbital Data']],
  ['motoring', ['Dunmore Tyres', 'Beacon Batteries', 'Sparkwell Plugs', 'Carlisle Components']],
  ['consumer', ['Market Place Stores', 'Valley Foods', 'Parkside Watches', 'Kingfisher Travel', 'Atlas Airlines']],
  ['energy', ['Greenline Power', 'Solace Solar', 'Tidewater Energy', 'Hydra Hydrogen']],
];
