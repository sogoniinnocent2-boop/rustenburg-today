export type HeroScene = {
  id: string;
  src: string;
  alt: string;
  credit: string;
  label: string;
  place: string;
  href: string;
  note: string;
  category: string;
  when: string;
  scope: string;
  map?: string;
};

/** Licensed photographs only. Each caption names the place the file actually shows. */
export const heroScenes: HeroScene[] = [
  {
    id: "magaliesberg-dawn",
    src: "/photos/magaliesberg-dawn.jpg",
    alt: "Mist over the Magaliesberg at dawn, photographed by JMK at Skeerpoort on 1 January 2022",
    credit: "JMK · 1 January 2022 · CC BY-SA 4.0",
    label: "Magaliesberg",
    place: "Skeerpoort, North West",
    href: "/tourism",
    note: "Dawn mist on the range. This is not the Rustenburg city centre.",
    category: "Nature and Magaliesberg",
    when: "1 January 2022",
    scope: "Regional. Skeerpoort is not the Rustenburg CBD.",
  },
  {
    id: "magaliesberg-fields",
    src: "/photos/magaliesberg.jpg",
    alt: "Farmland in front of the Magaliesberg, photographed by Olga Ernst on 29 September 2019 in Madibeng",
    credit: "Olga Ernst · 29 September 2019 · CC BY-SA 4.0",
    label: "Farmland",
    place: "Madibeng, North West",
    href: "/agriculture",
    note: "Fields below the Magaliesberg. The GPS on the file is in Madibeng, not the Rustenburg CBD.",
    category: "Agriculture",
    when: "29 September 2019",
    scope: "Regional. Madibeng, not the Rustenburg municipal centre.",
    map: "https://www.openstreetmap.org/?mlat=-25.808422&mlon=27.762874#map=13/-25.808422/27.762874",
  },
  {
    id: "rustenburg-kloof",
    src: "/photos/rustenburg-kloof.jpg",
    alt: "Hikers with a guide at Rustenburg Kloof in the Magaliesberg, photographed for South African Tourism on 16 April 2008",
    credit: "South African Tourism · 16 April 2008 · CC BY 2.0",
    label: "Rustenburg Kloof",
    place: "Magaliesberg, North West",
    href: "/tourism",
    note: "A guided walk at Rustenburg Kloof. The photograph is from 2008.",
    category: "Nature and Magaliesberg",
    when: "16 April 2008",
    scope: "Rustenburg Kloof. Historic photograph, not a current event.",
  },
  {
    id: "phokeng-stadium",
    src: "/photos/phokeng-stadium.jpg",
    alt: "Royal Bafokeng Stadium in Phokeng during a night match on 12 June 2010",
    credit: "2010 World Cup - Shine 2010 · 12 June 2010 · CC BY 2.0",
    label: "Royal Bafokeng Stadium",
    place: "Phokeng",
    href: "/sports",
    note: "The stadium in Phokeng on 12 June 2010. This is not a current community ceremony.",
    category: "Sports",
    when: "12 June 2010",
    scope: "Phokeng. Historic match photograph.",
  },
  {
    id: "kgaswane",
    src: "/photos/kgaswane.jpg",
    alt: "Grassland and hills at Kgaswane Mountain Reserve, photographed by Marco Schmidt in 2011",
    credit: "Marco Schmidt · 2011 · CC BY-SA 3.0",
    label: "Kgaswane Mountain Reserve",
    place: "Rustenburg, North West",
    href: "/tourism",
    note: "The reserve as photographed in 2011. This file does not show the city centre.",
    category: "Nature and Magaliesberg",
    when: "2011",
    scope: "Kgaswane Mountain Reserve, in the Rustenburg area.",
  },
];
