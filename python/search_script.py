# script.py
import sys
import asyncio
import time
import re
import json
import os
from typing import List, Tuple, Optional, Dict

from playwright.async_api import async_playwright
import google.generativeai as genai
import logging # Import logging for better error handling in parsing

# --- NICE Classification Data ---
NICE_CLASSIFICATION_TEXT = """
Class 1
Chemicals for use in industry, science and photography, as well as in agriculture, horticulture and forestry; unprocessed artificial resins, unprocessed plastics; fire extinguishing and fire prevention compositions; tempering and soldering preparations; substances for tanning animal skins and hides; adhesives for use in industry; putties and other paste fillers; compost, manures, fertilizers; biological preparations for use in industry and science.
Explanatory Note
Class 1 includes mainly chemical products for use in industry, science and agriculture, including those which go to the making of products belonging to other classes.
This Class includes, in particular:
-	sensitized paper;
-	tyre repairing compositions;
-	salt for preserving, other than for foodstuffs;
-	certain additives for use in the food industry, for example, pectin, lecithin, enzymes and chemical preservatives;
-	certain ingredients for use in the manufacture of cosmetics and pharmaceuticals, for example, vitamins, preservatives and antioxidants;
-	certain filtering materials, for example, mineral substances, vegetable substances and ceramic materials in particulate form.
This Class does not include, in particular:
-	raw natural resins (Cl. 2), semi-processed resins (Cl. 17);
-	chemical preparations for medical or veterinary purposes (Cl. 5);
-	fungicides, herbicides and preparations for destroying vermin (Cl. 5);
-	adhesives for stationery or household purposes (Cl. 16);
-	salt for preserving foodstuffs (Cl. 30);
-	straw mulch (Cl. 31).

Class 2
Paints, varnishes, lacquers; preservatives against rust and against deterioration of wood; colorants, dyes; inks for printing, marking and engraving; raw natural resins; metals in foil and powder form for use in painting, decorating, printing and art.
Explanatory Note
Class 2 includes mainly paints, colorants and preparations used for protection against corrosion.
This Class includes, in particular:
-	paints, varnishes and lacquers for industry, handicrafts and arts;
-	thinners, thickeners, fixatives and siccatives for paints, varnishes and lacquers;
-	mordants for wood and leather;
-	anti-rust oils and oils for the preservation of wood;
-	dyestuffs for clothing;
-	colorants for foodstuffs and beverages.
This Class does not include, in particular:
-	unprocessed artificial resins (Cl. 1), semi-processed resins (Cl. 17);
-	mordants for metals (Cl. 1);
-	laundry blueing and laundry bleaching preparations (Cl. 3);
-	cosmetic dyes (Cl. 3);
-	paint boxes (articles for use in school) (Cl. 16);
-	inks for stationery purposes (Cl. 16);
-	insulating paints and varnishes (Cl. 17).

Class 3
Non-medicated cosmetics and toiletry preparations; non-medicated dentifrices; perfumery, essential oils; bleaching preparations and other substances for laundry use; cleaning, polishing and abrasive preparations.
Explanatory Note
Class 3 includes mainly non-medicated toiletry preparations, as well as cleaning preparations for use in the home and other environments.
This Class includes, in particular:
-	sanitary preparations being toiletries;
-	tissues impregnated with cosmetic lotions;
-	deodorants for human beings or for animals;
-	room fragrancing preparations;
-	nail art stickers;
-	polishing wax;
-	sandpaper.
This Class does not include, in particular:
-	ingredients for use in the manufacture of cosmetics, for example, vitamins, preservatives and antioxidants (Cl. 1);
-	degreasing preparations for use in manufacturing processes (Cl. 1);
-	chemical chimney cleaners (Cl. 1);
-	deodorants, other than for human beings or for animals (Cl. 5);
-	medicated shampoos, soaps, lotions and dentifrices (Cl. 5);
-	emery boards, emery files, sharpening stones and grindstones (hand tools) (Cl. 8);
-	cosmetic and cleaning instruments, for example, make-up brushes (Cl. 21), cloths, pads and rags for cleaning (Cl. 21).

Class 4
Industrial oils and greases, wax; lubricants; dust absorbing, wetting and binding compositions; fuels and illuminants; candles and wicks for lighting.
Explanatory Note
Class 4 includes mainly industrial oils and greases, fuels and illuminants.
This Class includes, in particular:
-	oils for the preservation of masonry or of leather;
-	raw wax, industrial wax;
-	electrical energy;
-	motor fuels, biofuels;
-	non-chemical additives for fuels;
-	wood for use as fuel.
This Class does not include, in particular:
-	certain special industrial oils and greases, for example, oils for tanning leather (Cl. 1), oils for the preservation of wood, anti-rust oils and greases (Cl. 2), essential oils (Cl. 3);
-	massage candles for cosmetic purposes (Cl. 3) and medicated massage candles (Cl. 5);
-	certain special waxes, for example, grafting wax for trees (Cl. 1), tailors' wax, polishing wax, depilatory wax (Cl. 3), dental wax (Cl. 5), sealing wax (Cl. 16);
-	wicks adapted for oil stoves (Cl. 11) and for cigarette lighters (Cl. 34).

Class 5
Pharmaceuticals, medical and veterinary preparations; sanitary preparations for medical purposes; dietetic food and substances adapted for medical or veterinary use, food for babies; dietary supplements for human beings and animals; plasters, materials for dressings; material for stopping teeth, dental wax; disinfectants; preparations for destroying vermin; fungicides, herbicides.
Explanatory Note
Class 5 includes mainly pharmaceuticals and other preparations for medical or veterinary purposes.
This Class includes, in particular:
-	sanitary preparations for personal hygiene, other than toiletries;
-	diapers for babies and for incontinence;
-	deodorants, other than for human beings or for animals;
-	medicated shampoos, soaps, lotions and dentifrices;
-	dietary supplements intended to supplement a normal diet or to have health benefits;
-	meal replacements and dietetic food and beverages adapted for medical or veterinary use.
This Class does not include, in particular:
-	ingredients for use in the manufacture of pharmaceuticals, for example, vitamins, preservatives and antioxidants (Cl. 1);
-	sanitary preparations being non-medicated toiletries (Cl. 3);
-	deodorants for human beings or for animals (Cl. 3);
-	support bandages, orthopaedic bandages (Cl. 10);
-	meal replacements and dietetic food and beverages not specified as being for medical or veterinary use, which should be classified in the appropriate food or beverage classes, for example, low-fat potato crisps (Cl. 29), high-protein cereal bars (Cl. 30), isotonic beverages (Cl. 32).

Class 6
Common metals and their alloys, ores; metal materials for building and construction; transportable buildings of metal; non-electric cables and wires of common metal; small items of metal hardware; metal containers for storage or transport; safes.
Explanatory Note
Class 6 includes mainly unwrought and partly wrought common metals, including ores, as well as certain goods made of common metals.
This Class includes, in particular:
-	metals in foil or powder form for further processing, for example, for 3D printers;
-	metal building materials, for example, materials of metal for railway tracks, pipes and tubes of metal;
-	small items of metal hardware, for example, bolts, screws, nails, furniture casters, window fasteners;
-	transportable buildings or structures of metal, for example, prefabricated houses, swimming pools, cages for wild animals, skating rinks;
-	certain dispensing apparatus of metal, automatic or non-automatic, for example, towel dispensers, queue ticket dispensers, dispensers for dog waste bags, toilet paper dispensers;
-	certain goods made of common metals not otherwise classified by function or purpose, for example, all-purpose boxes of common metal, statues, busts and works of art of common metal.
This Class does not include, in particular:
-	metals and ores used as chemicals in industry or scientific research for their chemical properties, for example, bauxite, mercury, antimony, alkaline and alkaline-earth metals (Cl. 1);
-	metals in foil and powder form for use in painting, decorating, printing and art (Cl. 2);
-	certain dispensing apparatus that are classified according to their function or purpose, for example, fluid dispensing machines for industrial use (Cl. 7), ticket dispensing terminals, electronic (Cl. 9), dosage dispensers for medical use (Cl. 10), adhesive tape dispensers (Cl. 16);
-	electric cables (Cl. 9) and non-electric cables and ropes, not of metal (Cl. 22);
-	pipes being parts of sanitary installations (Cl. 11), flexible pipes, tubes and hoses, not of metal (Cl. 17) and rigid pipes, not of metal (Cl. 19);
-	cages for household pets (Cl. 21);
-	certain goods made of common metals that are classified according to their function or purpose, for example, hand tools, hand-operated (Cl. 8), paper clips (Cl. 16), furniture (Cl. 20), kitchen utensils (Cl. 21), household containers (Cl. 21).

Class 7
Machines, machine tools, power-operated tools; motors and engines, except for land vehicles; machine coupling and transmission components, except for land vehicles; agricultural implements, other than hand-operated hand tools; incubators for eggs; automatic vending machines.
Explanatory Note
Class 7 includes mainly machines and machine tools, motors and engines.
This Class includes, in particular:
-	parts of motors and engines of all kinds, for example, starters, mufflers and cylinders for motors and engines of any type;
-	electric cleaning and polishing apparatus, for example, electric shoe polishers, electric machines and apparatus for carpet shampooing and vacuum cleaners;
-	3D printers;
-	industrial robots;
-	certain special vehicles not for transportation purposes, for example, road sweeping machines, road making machines, bulldozers, snow ploughs, as well as rubber tracks as parts of those vehicles' crawlers.
This Class does not include, in particular:
-	hand tools and implements, hand-operated (Cl. 8);
-	humanoid robots with artificial intelligence, laboratory robots, teaching robots, security surveillance robots (Cl. 9), surgical robots (Cl. 10), robotic cars (Cl. 12), robotic drums (Cl. 15), toy robots (Cl. 28);
-	motors and engines for land vehicles (Cl. 12);
-	treads for vehicles, as well as tyres for all kinds of vehicle wheels (Cl. 12);
-	certain special machines, for example, automated teller machines (Cl. 9), respirators for artificial respiration (Cl. 10), refrigerating apparatus and machines (Cl. 11).

Class 8
Hand tools and implements, hand-operated; cutlery; side arms, except firearms; razors.
Explanatory Note
Class 8 includes mainly hand-operated tools and implements for performing tasks, such as drilling, shaping, cutting and piercing.
This Class includes, in particular:
-	hand-operated agricultural, gardening and landscaping tools;
-	hand-operated tools for carpenters, artists and other craftspersons, for example, hammers, chisels and gravers;
-	handles for hand-operated hand tools, such as knives and scythes;
-	electric and non-electric hand implements for personal grooming and body art, for example, razors, implements for hair curling, tattooing, and for manicure and pedicure;
-	hand-operated pumps;
-	table cutlery, such as knives, forks and spoons, including those made of precious metals.
This Class does not include, in particular:
-	machine tools and implements driven by a motor (Cl. 7);
-	surgical cutlery (Cl. 10);
-	pumps for bicycle tyres (Cl. 12), pumps specially adapted for use with balls for games (Cl. 28);
-	side arms being firearms (Cl. 13);
-	paper knives and paper shredders for office use (Cl. 16);
-	handles for objects that are classified in various classes according to their function or purpose, for example, walking stick handles, umbrella handles (Cl. 18), broom handles (Cl. 21);
-	serving utensils, for example, sugar tongs, ice tongs, pie servers and serving ladles, and kitchen utensils, for example, mixing spoons, pestles and mortars, nutcrackers and spatulas (Cl. 21);
-	fencing weapons (Cl. 28).

Class 9
Scientific, research, navigation, surveying, photographic, cinematographic, audiovisual, optical, weighing, measuring, signalling, detecting, testing, inspecting, life-saving and teaching apparatus and instruments; apparatus and instruments for conducting, switching, transforming, accumulating, regulating or controlling the distribution or use of electricity; apparatus and instruments for recording, transmitting, reproducing or processing sound, images or data; recorded and downloadable media, computer software, blank digital or analogue recording and storage media; mechanisms for coin-operated apparatus; cash registers, calculating devices; computers and computer peripheral devices; diving suits, divers' masks, ear plugs for divers, nose clips for divers and swimmers, gloves for divers, breathing apparatus for underwater swimming; fire-extinguishing apparatus.
Explanatory Note
Class 9 includes mainly apparatus and instruments for scientific or research purposes, audiovisual and information technology equipment, as well as safety and life-saving equipment.
This Class includes, in particular:
-	apparatus and instruments for scientific research in laboratories;
-	training apparatus and simulators, for example, resuscitation mannequins, simulators for the steering and control of vehicles;
-	apparatus and instruments for controlling and monitoring aircraft, watercraft and unmanned vehicles, for example, navigational instruments, transmitters, compasses for measuring, GPS apparatus, automatic steering apparatus for vehicles;
-	safety and security apparatus and instruments, for example, safety nets, signalling lights, traffic-light apparatus, fire engines, sound alarms, security token hardware for user authentication;
-	clothing that protects against serious or life-threatening injuries, for example, clothing for protection against accidents, irradiation and fire, bullet-proof clothing, protective helmets, head guards for sports, mouth guards for sports, protective suits for aviators, knee-pads for workers;
-	optical apparatus and instruments, for example, eyeglasses, contact lenses, magnifying glasses, mirrors for inspecting work, peepholes;
-	magnets;
-	smartwatches, wearable activity trackers;
-	joysticks for use with computers, other than for video games, virtual reality headsets, smartglasses;
-	eyeglass cases, cases for smartphones, cases especially made for photographic apparatus and instruments;
-	automated teller machines, invoicing machines, material testing instruments and machines;
-	batteries and chargers for electronic cigarettes;
-	electric and electronic effects units for musical instruments;
-	laboratory robots, teaching robots, security surveillance robots, humanoid robots with artificial intelligence.
This Class does not include, in particular:
-	joysticks being parts of machines, other than for game machines (Cl. 7), vehicle joysticks (Cl. 12), joysticks for video games, controllers for toys and game consoles (Cl. 28);
-	coin-operated apparatus that are classified in various classes according to their function or purpose, for example, coin-operated washing machines (Cl. 7), coin-operated billiard tables (Cl. 28);
-	industrial robots (Cl. 7), surgical robots (Cl. 10), toy robots (Cl. 28);
-	pulse meters, heart rate monitoring apparatus, body composition monitors (Cl. 10);
-	laboratory lamps, laboratory burners (Cl. 11);
-	diving lights (Cl. 11);
-	smart products whose main function remains the same, for example, smart refrigerators (Cl. 11), smart suitcases (Cl. 18), smart clothing (Cl. 25), smart toys (Cl. 28);
-	explosive fog signals, signal rocket flares (Cl. 13);
-	histological sections for teaching purposes, biological samples for use in microscopy as teaching materials (Cl. 16);
-	clothing and equipment worn for the practice of certain sports, for example, protective paddings being parts of sports suits, fencing masks, boxing gloves (Cl. 28).

Class 10
Surgical, medical, dental and veterinary apparatus and instruments; artificial limbs, eyes and teeth; orthopaedic articles; suture materials; therapeutic and assistive devices adapted for persons with disabilities; massage apparatus; apparatus, devices and articles for nursing infants; sexual activity apparatus, devices and articles.
Explanatory Note
Class 10 includes mainly surgical, medical, dental and veterinary apparatus, instruments and articles generally used for the diagnosis, treatment or improvement of function or condition of persons and animals.
This Class includes, in particular:
-	support bandages, orthopaedic bandages;
-	special clothing for medical purposes, for example, compression garments, stockings for varices, strait jackets, orthopaedic footwear;
-	articles, instruments and devices for menstruation, contraception and childbirth, for example, menstrual cups, pessaries, condoms, childbirth mattresses, forceps;
-	therapeutic and prosthetic articles and devices for implantation made of artificial or synthetic materials, for example, surgical implants comprised of artificial materials, artificial breasts, brain pacemakers, biodegradable bone fixation implants;
-	furniture especially made for medical purposes, for example, armchairs for medical or dental purposes, air mattresses for medical purposes, operating tables.
This Class does not include, in particular:
-	medical dressings and absorbent sanitary articles, for example, plasters, bandages and gauze for dressings, breast-nursing pads, diapers for babies and for incontinence, tampons (Cl. 5);
-	surgical implants comprised of living tissue (Cl. 5);
-	tobacco-free cigarettes for medical purposes (Cl. 5) and electronic cigarettes (Cl. 34);
-	wheelchairs and mobility scooters (Cl. 12);
-	massage tables, nursing pillows (Cl. 20).

Class 11
Apparatus and installations for lighting, heating, cooling, steam generating, cooking, drying, ventilating, water supply and sanitary purposes.
Explanatory Note
Class 11 includes mainly environmental control apparatus and installations, in particular, for the purposes of lighting, cooking, cooling and sanitizing.
This Class includes, in particular:
-	air-conditioning apparatus and installations;
-	ovens, other than for laboratory use, for example, dental ovens, microwave ovens, bakers' ovens;
-	stoves being heating apparatus;
-	solar thermal collectors;
-	chimney flues, chimney blowers, hearths, domestic fireplaces;
-	sterilizers, incinerators;
-	lighting apparatus and installations, for example, luminous tubes for lighting, searchlights, luminous house numbers, vehicle reflectors, lights for vehicles;
-	lamps, for example, electric lamps, gas lamps, laboratory lamps, oil lamps, street lamps, safety lamps;
-	tanning beds;
-	bath installations, bath fittings, bath plumbing fixtures;
-	toilets, urinals;
-	fountains, chocolate fountains;
-	electrically heated pads, cushions and blankets, not for medical purposes;
-	hot water bottles;
-	electrically heated clothing;
-	electric appliances for making yogurt, bread-making machines, coffee machines, ice-cream making machines;
-	ice machines and apparatus.
This Class does not include, in particular:
-	steam producing apparatus being parts of machines (Cl. 7);
-	air condensers (Cl. 7);
-	current generators, generators of electricity (Cl. 7);
-	soldering lamps (Cl. 7), optical lamps, darkroom lamps (Cl. 9), lamps for medical purposes (Cl. 10);
-	ovens for laboratory use (Cl. 9);
-	photovoltaic cells (Cl. 9);
-	signalling lights (Cl. 9);
-	electrically heated pads, cushions and blankets, for medical purposes (Cl. 10);
-	portable baby baths (Cl. 21);
-	non-electric portable coolers (Cl. 21);
-	cooking utensils that do not have an integrated heat source, for example, non-electric griddles and grills, non-electric waffle irons, non-electric pressure cookers (Cl. 21);
-	footmuffs, not electrically heated (Cl. 25).

Class 12
Vehicles; apparatus for locomotion by land, air or water.
Explanatory Note
Class 12 includes mainly vehicles and apparatus for the transport of people or goods by land, air or water.
This Class includes, in particular:
-	motors and engines for land vehicles;
-	couplings and transmission components for land vehicles;
-	air cushion vehicles;
-	remote control vehicles, other than toys;
-	parts of vehicles, for example, bumpers, windscreens, steering wheels;
-	treads for vehicles, as well as tyres for all kinds of vehicle wheels.
This Class does not include, in particular:
-	railway material of metal (Cl. 6);
-	motors, engines, couplings and transmission components, other than for land vehicles (Cl. 7);
-	parts of all kinds of motors and engines, for example, starters, mufflers and cylinders for motors and engines (Cl. 7);
-	rubber tracks being parts of crawlers on construction, mining, agricultural and other heavy-duty machines (Cl. 7);
-	tricycles for infants and scooters, being toys (Cl. 28);
-	certain special vehicles or wheeled apparatus not for transportation purposes, for example, self-propelled road sweeping machines (Cl. 7), fire engines (Cl. 9), tea carts (Cl. 20);
-	certain parts of vehicles, for example, electric batteries, mileage recorders and radios for vehicles (Cl. 9), lights for automobiles and bicycles (Cl. 11), automobile carpets (Cl. 27).

Class 13
Firearms; ammunition and projectiles; explosives; fireworks.
Explanatory Note
Class 13 includes mainly firearms and pyrotechnic products.
This Class includes, in particular:
-	rescue flares, explosive or pyrotechnic;
-	flare pistols;
-	sprays for personal defence purposes;
-	explosive fog signals, signal rocket flares;
-	air pistols being weapons;
-	bandoliers for weapons;
-	sporting firearms, hunting firearms.
This Class does not include, in particular:
-	grease for weapons (Cl. 4);
-	blades being weapons (Cl. 8);
-	side arms, other than firearms (Cl. 8);
-	non-explosive fog signals, rescue laser signalling flares (Cl. 9);
-	telescopic sights for firearms (Cl. 9);
-	flaming torches (Cl. 11);
-	Christmas crackers (Cl. 28);
-	percussion caps being toys (Cl. 28);
-	toy air pistols (Cl. 28);
-	matches (Cl. 34).

Class 14
Precious metals and their alloys; jewellery, precious and semi-precious stones; horological and chronometric instruments.
Explanatory Note
Class 14 includes mainly precious metals and certain goods made of precious metals or coated therewith, as well as jewellery, clocks and watches, and component parts therefor.
This Class includes, in particular:
-	jewellery, including imitation jewellery, for example, paste jewellery;
-	cuff links, tie pins, tie clips;
-	key rings, key chains and charms therefor;
-	jewellery charms;
-	jewellery boxes;
-	component parts for jewellery, clocks and watches, for example, clasps and beads for jewellery, movements for clocks and watches, clock hands, watch springs, watch crystals.
This Class does not include, in particular:
-	smartwatches (Cl. 9);
-	charms, other than for jewellery, key rings or key chains (Cl. 26);
-	objects of art not made of precious metals or coated therewith that are classified according to the material of which they are made, for example, works of art of metal (Cl. 6), of stone, concrete or marble (Cl. 19), of wood, wax, plaster or plastic (Cl. 20), of porcelain, ceramic, earthenware, terra-cotta or glass (Cl. 21);
-	certain goods made of precious metals or coated therewith that are classified according to their function or purpose, for example, metals in foil and powder form for use in painting, decorating, printing and art (Cl. 2), dental amalgams of gold (Cl. 5), cutlery (Cl. 8), electric contacts (Cl. 9), pen nibs of gold (Cl. 16), teapots (Cl. 21), gold and silver embroidery (Cl. 26), cigar boxes (Cl. 34).

Class 15
Musical instruments; music stands and stands for musical instruments; conductors' batons.
Explanatory Note
Class 15 includes mainly musical instruments, their parts and their accessories.
This Class includes, in particular:
-	mechanical musical instruments and their accessories, for example, barrel organs, mechanical pianos, intensity regulators for mechanical pianos, robotic drums;
-	musical boxes;
-	electrical and electronic musical instruments;
-	strings, reeds, pegs and pedals for musical instruments;
-	tuning forks, tuning hammers;
-	colophony (rosin) for stringed musical instruments.
This Class does not include, in particular:
-	apparatus for the recording, transmission, amplification and reproduction of sound, for example, electric and electronic effects units for musical instruments, wah-wah pedals, audio interfaces, audio mixers, equalisers being audio apparatus, subwoofers (Cl. 9);
-	downloadable music files (Cl. 9);
-	downloadable electronic sheet music (Cl. 9), printed sheet music (Cl. 16);
-	juke boxes, musical (Cl. 9);
-	metronomes (Cl. 9);
-	musical greeting cards (Cl. 16).

Class 16
Paper and cardboard; printed matter; bookbinding material; photographs; stationery and office requisites, except furniture; adhesives for stationery or household purposes; drawing materials and materials for artists; paintbrushes; instructional and teaching materials; plastic sheets, films and bags for wrapping and packaging; printers' type, printing blocks.
Explanatory Note
Class 16 includes mainly paper, cardboard and certain goods made of those materials, as well as office requisites.
This Class includes, in particular:
-	paper knives and paper cutters;
-	cases, covers and devices for holding or securing paper, for example, document files, money clips, holders for cheque books, paper-clips, passport holders, scrapbooks;
-	certain office machines, for example, typewriters, duplicators, franking machines for office use, pencil sharpeners;
-	painting articles for use by artists and interior and exterior painters, for example, artists' watercolour saucers, painters' easels and palettes, paint rollers and trays;
-	certain disposable paper products, for example, bibs, handkerchiefs and table linen of paper;
-	certain goods made of paper or cardboard not otherwise classified by function or purpose, for example, paper bags, envelopes and containers for packaging, statues, figurines and works of art of paper or cardboard, such as figurines of papier mâché, framed or unframed lithographs, paintings and watercolours.
This Class does not include, in particular:
-	paints (Cl. 2);
-	hand tools for artists, for example, spatulas, sculptors' chisels (Cl. 8);
-	teaching apparatus, for example, audiovisual teaching apparatus, resuscitation mannequins (Cl. 9), and toy models (Cl. 28);
-	certain goods made of paper or cardboard that are classified according to their function or purpose, for example, photographic paper (Cl. 1), abrasive paper (Cl. 3), paper blinds (Cl. 20), table cups and plates of paper (Cl. 21), bed linen of paper (Cl. 24), paper clothing (Cl. 25), cigarette paper (Cl. 34).

Class 17
Unprocessed and semi-processed rubber, gutta-percha, gum, asbestos, mica and substitutes for all these materials; plastics and resins in extruded form for use in manufacture; packing, stopping and insulating materials; flexible pipes, tubes and hoses, not of metal.
Explanatory Note
Class 17 includes mainly electrical, thermal and acoustic insulating materials and plastics for use in manufacture in the form of sheets, blocks and rods, as well as certain goods made of rubber, gutta-percha, gum, asbestos, mica or substitutes therefor.
This Class includes, in particular:
-	rubber material for recapping tyres;
-	floating anti-pollution barriers;
-	adhesive tapes, other than stationery and not for medical or household purposes;
-	plastic films, other than for wrapping and packaging, for example, anti-dazzle films for windows;
-	elastic threads and threads of rubber or plastic, not for textile use;
-	certain goods made of the materials in this class not otherwise classified by function or purpose, for example, foam supports for flower arrangements, padding and stuffing materials of rubber or plastics, rubber stoppers, shock-absorbing buffers of rubber, rubber bags or envelopes for packaging.
This Class does not include, in particular:
-	fire hose (Cl. 9);
-	pipes being parts of sanitary installations (Cl. 11) and rigid pipes of metal (Cl. 6) and not of metal (Cl. 19);
-	insulating glass for building (Cl. 19);
-	certain goods made of the materials in this class that are classified according to their function or purpose, for example, gum resins (Cl. 2), rubber for dental purposes (Cl. 5), asbestos screens for firefighters (Cl. 9), adhesive rubber patches for repairing inner tubes (Cl. 12), erasers (Cl. 16).

Class 18
Leather and imitations of leather; animal skins and hides; luggage and carrying bags; umbrellas and parasols; walking sticks; whips, harness and saddlery; collars, leashes and clothing for animals.
Explanatory Note
Class 18 includes mainly leather, imitations of leather and certain goods made of those materials.
This Class includes, in particular:
-	luggage and carrying bags, for example, suitcases, trunks, travelling bags, sling bags for carrying infants, school bags;
-	luggage or baggage tags;
-	business card cases and pocket wallets;
-	boxes and cases of leather or leatherboard.
This Class does not include, in particular:
-	walking sticks or canes for medical purposes (Cl. 10);
-	clothing, footwear and headwear of leather for human beings (Cl. 25);
-	bags and cases adapted to the product they are intended to contain, for example, bags adapted for laptops (Cl. 9), bags and cases for cameras and photographic equipment (Cl. 9), cases for musical instruments (Cl. 15), golf bags with or without wheels, bags especially designed for skis and surfboards (Cl. 28);
-	certain goods made of leather, imitations of leather, animal skins and hides that are classified according to their function or purpose, for example, leather strops (Cl. 8), polishing leather (Cl. 21), chamois leather for cleaning (Cl. 21), leather belts for clothing (Cl. 25).

Class 19
Materials, not of metal, for building and construction; rigid pipes, not of metal, for building; asphalt, pitch, tar and bitumen; transportable buildings, not of metal; monuments, not of metal.
Explanatory Note
Class 19 includes mainly materials, not of metal, for building and construction.
This Class includes, in particular:
-	semi-worked woods for use in building, for example, beams, planks, panels;
-	wood veneers;
-	building glass, for example, glass tiles, insulating glass for building, safety glass;
-	glass granules for marking out roads;
-	granite, marble, gravel;
-	terra-cotta for use as a building material;
-	roofing, not of metal, incorporating photovoltaic cells;
-	gravestones and tombs, not of metal;
-	statues, busts and works of art of stone, concrete or marble;
-	letter boxes of masonry;
-	geotextiles;
-	coatings being building materials;
-	scaffolding, not of metal;
-	transportable buildings or structures, not of metal, for example, aquaria, aviaries, flagpoles, porches, swimming pools.
This Class does not include, in particular:
-	cement preservatives, cement-waterproofing preparations (Cl. 1);
-	fireproofing preparations (Cl. 1);
-	wood preservatives (Cl. 2);
-	oils for releasing form work for building (Cl. 4);
-	letter boxes of metal (Cl. 6) and not of metal or masonry (Cl. 20);
-	statues, busts and works of art of common metal (Cl. 6), of precious metal (Cl. 14), of wood, wax, plaster or plastic (Cl. 20), of porcelain, ceramic, earthenware, terra-cotta or glass (Cl. 21);
-	certain pipes, not of metal, not for building, for example, pipes being parts of sanitary installations (Cl. 11), flexible pipes, tubes and hoses, not of metal (Cl. 17);
-	substances for insulating buildings against moisture (Cl. 17);
-	glass for vehicle windows (semi-finished product) (Cl. 21);
-	birdcages (Cl. 21);
-	mats and matting, linoleum and other materials for covering existing floors (Cl. 27);
-	unsawn or undressed timber (Cl. 31).

Class 20
Furniture, mirrors, picture frames; containers, not of metal, for storage or transport; unworked or semi-worked bone, horn, whalebone or mother-of-pearl; shells; meerschaum; yellow amber.
Explanatory Note
Class 20 includes mainly furniture and parts therefor, as well as certain goods made of wood, cork, reed, cane, wicker, horn, bone, whalebone, shell, amber, mother-of-pearl, meerschaum and substitutes for all these materials, or of plastic.
This Class includes, in particular:
-	metal furniture, furniture for camping, gun racks, newspaper display stands;
-	indoor window blinds and shades;
-	bedding, for example, mattresses, bed bases, pillows;
-	looking glasses, furniture and toilet mirrors;
-	registration plates, not of metal;
-	small items of hardware, not of metal, for example, bolts, screws, dowels, furniture casters, collars for fastening pipes;
-	letter boxes, not of metal or masonry;
-	certain dispensing apparatus, not of metal, automatic or non-automatic, for example, towel dispensers, queue ticket dispensers, dispensers for dog waste bags, toilet paper dispensers.
This Class does not include, in particular:
-	special furniture for laboratories (Cl. 9) or for medical use (Cl. 10);
-	outdoor blinds of metal (Cl. 6), not of metal and not of textile (Cl. 19), of textile (Cl. 22);
-	bed linen, eiderdowns and sleeping bags (Cl. 24);
-	certain dispensing apparatus that are classified according to their function or purpose, for example, fluid dispensing machines for industrial use (Cl. 7), ticket dispensing terminals, electronic (Cl. 9), dosage dispensers for medical use (Cl. 10), adhesive tape dispensers (Cl. 16);
-	certain mirrors for specific uses, for example, mirrors used in optical goods (Cl. 9), mirrors used in surgery or dentistry (Cl. 10), rearview mirrors (Cl. 12), sighting mirrors for guns (Cl. 13);
-	certain goods made of wood, cork, reed, cane, wicker, horn, bone, whalebone, shell, amber, mother-of-pearl, meerschaum and substitutes for all these materials, or of plastic, that are classified according to their function or purpose, for example, beads for making jewellery (Cl. 14), wooden floor boards (Cl. 19), baskets for domestic use (Cl. 21), plastic cups (Cl. 21), reed mats (Cl. 27).

Class 21
Household or kitchen utensils and containers; cookware and tableware, except forks, knives and spoons; combs and sponges; brushes, except paintbrushes; brush-making materials; articles for cleaning purposes; unworked or semi-worked glass, except building glass; glassware, porcelain and earthenware.
Explanatory Note
Class 21 includes mainly small, hand-operated utensils and apparatus for household and kitchen use, as well as cosmetic utensils, glassware and certain goods made of porcelain, ceramic, earthenware, terra-cotta or glass.
This Class includes, in particular:
-	household and kitchen utensils, for example, fly swatters, clothes-pegs, mixing spoons, basting spoons and corkscrews, as well as serving utensils, for example, sugar tongs, ice tongs, pie servers and serving ladles;
-	household, kitchen and cooking containers, for example, vases, bottles, piggy banks, pails, cocktail shakers, and non-electric kettles, pressure cookers, cooking pots and pans;
-	small hand-operated kitchen apparatus for mincing, grinding, pressing or crushing, for example, garlic presses, nutcrackers, pestles and mortars;
-	dish stands and decanter stands;
-	cosmetic utensils, for example, electric and non-electric combs and toothbrushes, dental floss, foam toe separators for use in pedicures, powder puffs, fitted vanity cases;
-	gardening articles, for example, gardening gloves, window-boxes, watering cans and nozzles for watering hose;
-	indoor aquaria, terrariums and vivariums.
This Class does not include, in particular:
-	cleaning preparations (Cl. 3);
-	containers for storage and transport of goods, of metal (Cl. 6), not of metal (Cl. 20);
-	small apparatus for mincing, grinding, pressing or crushing, which are driven by electricity (Cl. 7);
-	razors and shaving apparatus, hair and nail clippers, electric and non-electric implements for manicure and pedicure, for example, manicure sets, emery boards, cuticle nippers (Cl. 8);
-	table cutlery (Cl. 8) and hand-operated cutting tools for kitchen use, for example, vegetable shredders, pizza cutters, cheese slicers (Cl. 8);
-	lice combs, tongue scrapers (Cl. 10);
-	cooking utensils, electric (Cl. 11);
-	toilet mirrors (Cl. 20);
-	certain goods made of glass, porcelain and earthenware that are classified according to their function or purpose, for example, porcelain for dental prostheses (Cl. 5), spectacle lenses (Cl. 9), glass wool for insulation, acrylic or organic glass, semi-processed (Cl. 17), earthenware tiles (Cl. 19), building glass (Cl. 19), glass fibres for textile use (Cl. 22).

Class 22
Ropes and string; nets; tents and tarpaulins; awnings of textile or synthetic materials; sails; sacks for the transport and storage of materials in bulk; padding, cushioning and stuffing materials, except of paper, cardboard, rubber or plastics; raw fibrous textile materials and substitutes therefor.
Explanatory Note
Class 22 includes mainly canvas and other materials for making sails, rope, padding, cushioning and stuffing materials and raw fibrous textile materials.
This Class includes, in particular:
-	cords and twines made of natural or artificial textile fibres, paper or plastics;
-	commercial fishing nets, hammocks, rope ladders;
-	vehicle covers, not fitted;
-	certain sacks and bags not otherwise classified by function or purpose, for example, mesh bags for washing laundry, body bags, mail bags;
-	packaging bags of textile;
-	animal fibres and raw textile fibres, for example, animal hair, cocoons, jute, raw or treated wool, raw silk.
This Class does not include, in particular:
-	metal ropes (Cl. 6);
-	strings for musical instruments (Cl. 15) and for sports rackets (Cl. 28);
-	padding and stuffing materials of paper or cardboard (Cl. 16), rubber or plastics (Cl. 17);
-	certain nets and bags that are classified according to their function or purpose, for example, safety nets (Cl. 9), luggage nets for vehicles (Cl. 12), garment bags for travel (Cl. 18), hair nets (Cl. 26), golf bags (Cl. 28), nets for sports (Cl. 28);
-	packaging bags, not of textile, which are classified according to the material of which they are made, for example, packaging bags of paper or plastics (Cl. 16), of rubber (Cl. 17), of leather (Cl. 18).

Class 23
Yarns and threads for textile use.
Explanatory Note
Class 23 includes mainly natural or synthetic yarns and threads for textile use.
This Class includes, in particular:
-	fibreglass, elastic, rubber and plastic threads for textile use;
-	threads for embroidery, darning and sewing, including those of metal;
-	spun silk, spun cotton, spun wool.
This Class does not include, in particular:
-	certain threads for specific uses, for example, identification threads for electric wires (Cl. 9), surgical thread (Cl. 10), threads of precious metal being jewellery (Cl. 14);
-	threads, other than for textile use, that are classified according to the material of which they are made, for example, threads for binding of metal (Cl. 6) and not of metal (Cl. 22), elastic threads, threads of rubber or plastic (Cl. 17), fibreglass threads (Cl. 21).

Class 24
Textiles and substitutes for textiles; household linen; curtains of textile or plastic.
Explanatory Note
Class 24 includes mainly fabrics and fabric covers for household use.
This Class includes, in particular:
-	household linen, for example, bedspreads, pillow shams, towels of textile;
-	bed linen of paper;
-	sleeping bags, sleeping bag liners;
-	mosquito nets.
This Class does not include, in particular:
-	electrically heated blankets, for medical purposes (Cl. 10) and not for medical purposes (Cl. 11);
-	table linen of paper (Cl. 16);
-	asbestos safety curtains (Cl. 17), bamboo curtains and bead curtains for decoration (Cl. 20);
-	horse blankets (Cl. 18);
-	certain textiles and fabrics for specific uses, for example, fabrics for bookbinding (Cl. 16), insulating fabrics (Cl. 17), geotextiles (Cl. 19).

Class 25
Clothing, footwear, headwear.
Explanatory Note
Class 25 includes mainly clothing, footwear and headwear for human beings.
This Class includes, in particular:
-	parts of clothing, footwear and headwear, for example, cuffs, pockets, ready-made linings, heels and heelpieces, cap peaks, hat frames (skeletons);
-	clothing and footwear for sports, for example, ski gloves, sports singlets, cyclists' clothing, judo and karate uniforms, football shoes, gymnastic shoes, ski boots;
-	masquerade costumes;
-	paper clothing, paper hats for use as clothing;
-	bibs, not of paper;
-	pocket squares;
-	footmuffs, not electrically heated.
This Class does not include, in particular:
-	small items of hardware used in shoemaking, for example, shoe pegs and shoe dowels of metal (Cl. 6) and not of metal (Cl. 20), as well as haberdashery accessories and fastenings for clothing, footwear and headwear, for example, clasps, buckles, zippers, ribbons, hatbands, hat and shoe trimmings (Cl. 26);
-	certain clothing, footwear and headwear for special use, for example, protective helmets, including for sports (Cl. 9), clothing for protection against fire (Cl. 9), clothing especially for operating rooms (Cl. 10), orthopaedic footwear (Cl. 10), as well as clothing and footwear that are essential for the practice of certain sports, for example, baseball gloves, boxing gloves, ice skates (Cl. 28);
-	electrically heated clothing (Cl. 11);
-	electrically heated footmuffs (Cl. 11), fitted footmuffs for pushchairs and prams (Cl. 12);
-	bibs of paper (Cl. 16);
-	handkerchiefs of paper (Cl. 16) and of textile (Cl. 24);
-	clothing for animals (Cl. 18);
-	carnival masks (Cl. 28);
-	dolls' clothes (Cl. 28);
-	paper party hats (Cl. 28).

Class 26
Lace, braid and embroidery, and haberdashery ribbons and bows; buttons, hooks and eyes, pins and needles; artificial flowers; hair decorations; false hair.
Explanatory Note
Class 26 includes mainly dressmakers' articles, natural or synthetic hair for wear, and hair adornments, as well as small decorative items intended to adorn a variety of objects, not included in other classes.
This Class includes, in particular:
-	wigs, toupees, false beards;
-	barrettes, hair bands;
-	ribbons and bows being haberdashery or used as hair decorations, made of any material;
-	ribbons and bows for gift wrapping, not of paper;
-	hair nets;
-	buckles, zippers;
-	charms, other than for jewellery, key rings or key chains;
-	artificial Christmas garlands and wreaths, including those incorporating lights;
-	certain articles for curling hair, for example, electric and non-electric hair curlers, other than hand implements, hair curling pins, hair curling paper.
This Class does not include, in particular:
-	false eyelashes (Cl. 3);
-	hooks being small items of metal hardware (Cl. 6) or hardware, not of metal (Cl. 20), curtain hooks (Cl. 20);
-	certain special types of needles, for example, tattoo needles (Cl. 8), needles for surveying compasses (Cl. 9), needles for medical purposes (Cl. 10), needles for pumps for inflating balls for games (Cl. 28);
-	hand implements for curling hair, for example, curling tongs, eyelash curlers (Cl. 8);
-	hair prostheses (Cl. 10);
-	jewellery charms, charms for key rings or key chains (Cl. 14);
-	certain ribbons and bows, for example, paper ribbons and bows, other than haberdashery or hair decorations (Cl. 16), rhythmic gymnastics ribbons (Cl. 28);
-	yarns and threads for textile use (Cl. 23);
-	Christmas trees of synthetic material (Cl. 28).

Class 27
Carpets, rugs, mats and matting, linoleum and other materials for covering existing floors; wall hangings, not of textile.
Explanatory Note
Class 27 includes mainly products intended to be added as coverings to previously constructed floors and walls.
This Class includes, in particular:
-	automobile carpets;
-	mats being floor coverings, for example, bath mats, door mats, gymnastic mats, yoga mats;
-	artificial turf;
-	wallpaper, including textile wallpaper.
This Class does not include, in particular:
-	floors, floorings and floor tiles of metal (Cl. 6) and not of metal (Cl. 19), wooden floor boards (Cl. 19);
-	electrically heated carpets (Cl. 11);
-	geotextiles (Cl. 19);
-	mats for infant playpens (Cl. 20);
-	wall hangings of textile (Cl. 24).

Class 28
Games, toys and playthings; video game apparatus; gymnastic and sporting articles; decorations for Christmas trees.
Explanatory Note
Class 28 includes mainly toys, apparatus for playing games, sports equipment, amusement and novelty items, as well as certain articles for Christmas trees.
This Class includes, in particular:
-	amusement and game apparatus, including controllers therefor;
-	novelty toys for playing jokes and for parties, for example, carnival masks, paper party hats, confetti, party poppers and Christmas crackers;
-	hunting and fishing tackle, for example, fishing rods, landing nets for anglers, decoys, hunting game calls;
-	equipment for various sports and games.
This Class does not include, in particular:
-	Christmas tree candles (Cl. 4), electric lights for Christmas trees (Cl. 11), confectionery and chocolate decorations for Christmas trees (Cl. 30);
-	diving equipment (Cl. 9);
-	sex toys and love dolls (Cl. 10);
-	clothing for gymnastics and sports (Cl. 25);
-	certain gymnastic and sporting articles, for example, protective helmets, goggles and mouthguards for sports (Cl. 9), sporting firearms (Cl. 13), gymnasium mats (Cl. 27), as well as certain fishing and hunting equipment, for example, hunting knives, harpoons (Cl. 8), hunting firearms (Cl. 13), commercial fishing nets (Cl. 22), that are classified according to other functions or purposes.

Class 29
Meat, fish, poultry and game; meat extracts; preserved, frozen, dried and cooked fruits and vegetables; jellies, jams, compotes; eggs; milk, cheese, butter, yogurt and other milk products; oils and fats for food.
Explanatory Note
Class 29 includes mainly foodstuffs of animal origin, as well as vegetables and other horticultural comestible products which are prepared or preserved for consumption.
This Class includes, in particular:
-	meat-, fish-, fruit- or vegetable-based food;
-	edible insects;
-	milk beverages with milk predominating;
-	milk substitutes, for example, almond milk, coconut milk, peanut milk, rice milk, soya milk;
-	preserved mushrooms;
-	pulses and nuts prepared for human consumption;
-	seeds prepared for human consumption, not being seasonings or flavourings.
This Class does not include, in particular:
-	oils and fats, other than for food, for example, essential oils (Cl. 3), industrial oil (Cl. 4), castor oil for medical purposes (Cl. 5);
-	baby food (Cl. 5);
-	dietetic food and substances adapted for medical use (Cl. 5);
-	dietary supplements (Cl. 5);
-	salad dressings (Cl. 30);
-	processed seeds for use as a seasoning (Cl. 30);
-	chocolate-coated nuts (Cl. 30);
-	fresh and unprocessed fruits, vegetables, nuts and seeds (Cl. 31);
-	foodstuffs for animals (Cl. 31);
-	live animals (Cl. 31);
-	seeds for planting (Cl. 31).

Class 30
Coffee, tea, cocoa and substitutes therefor; rice, pasta and noodles; tapioca and sago; flour and preparations made from cereals; bread, pastries and confectionery; chocolate; ice cream, sorbets and other edible ices; sugar, honey, treacle; yeast, baking-powder; salt, seasonings, spices, preserved herbs; vinegar, sauces and other condiments; ice (frozen water).
Explanatory Note
Class 30 includes mainly foodstuffs of plant origin, except fruits and vegetables, prepared or preserved for consumption, as well as auxiliaries intended for the improvement of the flavour of food.
This Class includes, in particular:
-	beverages with coffee, cocoa, chocolate or tea base;
-	cereals prepared for human consumption, for example, oat flakes, corn chips, husked barley, bulgur, muesli;
-	pizza, pies, sandwiches;
-	chocolate-coated nuts;
-	flavourings, other than essential oils, for food or beverages.
This Class does not include, in particular:
-	salt for industrial purposes (Cl. 1);
-	food or beverage flavourings being essential oils (Cl. 3);
-	medicinal teas and dietetic food and substances adapted for medical use (Cl. 5);
-	baby food (Cl. 5);
-	dietary supplements (Cl. 5);
-	yeast for pharmaceutical purposes (Cl. 5), yeast for animal consumption (Cl. 31);
-	milk beverages flavoured with coffee, cocoa, chocolate or tea (Cl. 29);
-	soups, bouillon (Cl. 29);
-	raw cereals (Cl. 31);
-	fresh herbs (Cl. 31);
-	foodstuffs for animals (Cl. 31).

Class 31
Raw and unprocessed agricultural, aquacultural, horticultural and forestry products; raw and unprocessed grains and seeds; fresh fruits and vegetables, fresh herbs; natural plants and flowers; bulbs, seedlings and seeds for planting; live animals; foodstuffs and beverages for animals; malt.
Explanatory Note
Class 31 includes mainly land and sea products not having been subjected to any form of preparation for consumption, live animals and plants, as well as foodstuffs for animals.
This Class includes, in particular:
-	unprocessed cereals;
-	fresh fruits and vegetables, even after washing or waxing;
-	plant residue;
-	unprocessed algae;
-	unsawn timber;
-	fertilised eggs for hatching;
-	fresh mushrooms and truffles;
-	litter for animals, for example, aromatic sand, sanded paper for pets.
This Class does not include, in particular:
-	cultures of micro-organisms and leeches for medical purposes (Cl. 5);
-	dietary supplements for animals and medicated animal feed (Cl. 5);
-	semi-worked woods (Cl. 19);
-	artificial fishing bait (Cl. 28);
-	rice (Cl. 30);
-	tobacco (Cl. 34).

Class 32
Beers; non-alcoholic beverages; mineral and aerated waters; fruit beverages and fruit juices; syrups and other preparations for making non-alcoholic beverages.
Explanatory Note
Class 32 includes mainly non-alcoholic beverages, as well as beer.
This Class includes, in particular:
-	de-alcoholised beverages;
-	soft drinks;
-	rice-based and soya-based beverages, other than milk substitutes;
-	energy drinks, isotonic beverages, protein-enriched sports beverages;
-	non-alcoholic essences and fruit extracts for making beverages.
This Class does not include, in particular:
-	flavourings for beverages being essential oils (Cl. 3) or other than essential oils (Cl. 30);
-	dietetic beverages adapted for medical purposes (Cl. 5);
-	milk beverages with milk predominating, milk shakes (Cl. 29);
-	milk substitutes, for example, almond milk, coconut milk, peanut milk, rice milk, soya milk (Cl. 29);
-	lemon juice for culinary purposes, tomato juice for cooking (Cl. 29);
-	beverages with coffee, cocoa, chocolate or tea base (Cl. 30);
-	beverages for pets (Cl. 31);
-	alcoholic beverages, except beer (Cl. 33).

Class 33
Alcoholic beverages, except beers; alcoholic preparations for making beverages.
Explanatory Note
Class 33 includes mainly alcoholic beverages, essences and extracts.
This Class includes, in particular:
-	wines, fortified wines;
-	alcoholic cider, perry;
-	spirits, liqueurs;
-	alcoholic essences, alcoholic fruit extracts, bitters.
This Class does not include, in particular:
-	medicinal beverages (Cl. 5);
-	de-alcoholised beverages (Cl. 32);
-	beers (Cl. 32);
-	non-alcoholic mixers used to make alcoholic beverages, for example, soft drinks, soda water (Cl. 32).

Class 34
Tobacco and tobacco substitutes; cigarettes and cigars; electronic cigarettes and oral vaporizers for smokers; smokers' articles; matches.
Explanatory Note
Class 34 includes mainly tobacco and articles used for smoking, as well as certain accessories and containers related to their use.
This Class includes, in particular:
-	tobacco substitutes, not for medical purposes;
-	flavourings, other than essential oils, for use in electronic cigarettes, oral vaporizers for smokers;
-	herbs for smoking;
-	snuff;
-	certain accessories and containers related to the use of tobacco and articles for smoking, for example, lighters for smokers, ashtrays for smokers, tobacco jars, snuff boxes, cigar humidors.
This Class does not include, in particular:
-	tobacco-free cigarettes for medical purposes (Cl. 5);
-	batteries and chargers for electronic cigarettes (Cl. 9);
-	ashtrays for automobiles (Cl. 12).

Class 35
Advertising; business management, organization and administration; office functions.
Explanatory Note
Class 35 includes mainly services involving business management, operation, organization and administration of a commercial or industrial enterprise, as well as advertising, marketing and promotional services. For the purposes of classification, the sale of goods is not considered to be a service.
This Class includes, in particular:
-	the bringing together, for the benefit of others, of a variety of goods, excluding the transport thereof, enabling customers to conveniently view and purchase those goods; such services may be provided by retail stores, wholesale outlets, through vending machines, mail order catalogues or by means of electronic media, for example, through websites or television shopping programmes;
-	advertising, marketing and promotional services, for example, distribution of samples, development of advertising concepts, writing and publication of publicity texts;
-	shop window dressing;
-	public relations services;
-	production of teleshopping programmes;
-	organization of trade fairs and exhibitions for commercial or advertising purposes;
-	search engine optimization for sales promotion;
-	commercial assistance services, for example, personnel recruitment, negotiation of business contracts for others, cost price analysis, import-export agency services;
-	administration services relating to business transactions and financial records, for example, book-keeping, drawing up of statements of accounts, business and financial auditing, business appraisals, tax preparation and filing services;
-	commercial administration of the licensing of the goods and services of others;
-	services consisting of the registration, transcription, composition, compilation or systematization of written communications and registrations, and also the compilation of mathematical or statistical data;
-	office functions, for example, appointment scheduling and reminder services, data search in computer files for others, computerized file management, telephone switchboard services.
This Class does not include, in particular:
-	financial services, for example, financial analysis, financial management, financial sponsorship (Cl. 36);
-	real estate management (Cl. 36);
-	stock brokerage services (Cl. 36);
-	transportation logistics (Cl. 39);
-	energy auditing (Cl. 42);
-	graphic design of promotional materials (Cl. 42);
-	legal services in relation to the negotiation of contracts for others (Cl. 45);
-	licensing of intellectual property, legal administration of licences, copyright management (Cl. 45);
-	registration of domain names (Cl. 45).

Class 36
Financial, monetary and banking services; insurance services; real estate services.
Explanatory Note
Class 36 includes mainly services relating to banking and other financial transactions, financial valuation services, as well as insurance and real estate activities.
This Class includes, in particular:
-	financial transaction and payment services, for example, exchanging money, electronic funds transfer, processing of credit card and debit card payments, issuance of travellers' cheques;
-	financial management and research;
-	financial appraisals, for example, jewellery, art and real estate appraisal, repair costs evaluation;
-	cheque verification;
-	financing and credit services, for example, loans, issuance of credit cards, hire- or lease-purchase financing;
-	crowdfunding;
-	safe deposit services;
-	financial sponsorship;
-	real estate agency services, real estate management, rental of apartments, rent collection;
-	insurance underwriting, actuarial services;
-	brokerage services, for example, securities, insurance and real estate brokerage, brokerage of carbon credits, pawnbrokerage.
This Class does not include, in particular:
-	administration services relating to business transactions and financial records, for example, book-keeping, drawing up of statements of accounts, business and financial auditing, business appraisals, tax preparation and filing services (Cl. 35);
-	sponsorship search, promotion of goods and services through sponsorship of sports events (Cl. 35);
-	cash replenishment of automated teller machines (Cl. 39);
-	freight brokerage, transport brokerage (Cl. 39);
-	quality evaluation of wool and standing timber (Cl. 42).

Class 37
Construction services; installation and repair services; mining extraction, oil and gas drilling.
Explanatory Note
Class 37 includes mainly services in the field of construction, as well as services involving the restoration of objects to their original condition or their preservation without altering their physical or chemical properties.
This Class includes, in particular:
-	construction and demolition of buildings, roads, bridges, dams or transmission lines, as well as services in the field of construction, for example, interior and exterior painting, plastering, plumbing, heating equipment installation, and roofing;
-	shipbuilding;
-	rental of construction tools, machines and equipment, for example, rental of bulldozers, rental of cranes;
-	various repair services, for example, those in the fields of electricity, computer hardware, furniture, instruments, tools;
-	various restoration services, for example, building restoration, furniture restoration and restoration of works of art;
-	maintenance services for preserving an object in its original condition without changing any of its properties, for example, furniture maintenance, vehicle maintenance, swimming-pool maintenance and maintenance of computer hardware;
-	cleaning of different objects, for example, windows, vehicles, clothing, as well as the laundering and pressing of clothing.
This Class does not include, in particular:
-	physical storage of goods (Cl. 39);
-	transformation of an object or substance that involves a process of change in its essential properties, for example, the cutting, dyeing, fireproofing of cloth (Cl. 40), the casting, plating, treating of metal (Cl. 40), custom tailoring, dressmaking, embroidering (Cl. 40), food and drink preservation (Cl. 40);
-	installation, maintenance and updating of computer software (Cl. 42), creation and hosting of websites (Cl. 42);
-	construction drafting and architectural services (Cl. 42).

Class 38
Telecommunications services.
Explanatory Note
Class 38 includes mainly services that allow at least one party to communicate with another, as well as services for the broadcasting and transmission of data.
This Class includes, in particular:
-	transmission of digital files and electronic mail;
-	providing user access to global computer networks;
-	radio and television broadcasting;
-	video-on-demand transmission;
-	providing internet chatrooms and online forums;
-	telephone and voice mail services;
-	teleconferencing and videoconferencing services.
This Class does not include, in particular:
-	radio advertising (Cl. 35);
-	telemarketing services (Cl. 35);
-	content or subject matter that may be contained in the communication activity, for example, downloadable image files (Cl. 9), providing business information via a website (Cl. 35), providing films and television programmes, not downloadable, via video-on-demand services (Cl. 41);
-	services conducted using telecommunication connections, for example, online retail services for downloadable digital music (Cl. 35), online banking (Cl. 36);
-	production of radio and television programmes (Cl. 41);
-	telecommunications technology consultancy (Cl. 42);
-	online social networking services (Cl. 45).

Class 39
Transport; packaging and storage of goods; travel arrangement.
Explanatory Note
Class 39 includes mainly services for the transport of people, animals or goods from one place to another by rail, road, water, air or pipeline and services necessarily connected with such transport, as well as the storing of goods in any kind of storage facility, warehouses or other types of building for their preservation or guarding.
This Class includes, in particular:
-	operation of stations, bridges, railways, ferries and other transport facilities;
-	rental of vehicles for transportation, as well as chauffeuring and piloting services;
-	rental services related to transport, storage and travel, for example, parking place rental, garage rental, rental of storage containers;
-	operation of maritime tugs, unloading, operation of ports and docks, and salvaging of wrecked ships and their cargoes;
-	packaging, bottling, wrapping and delivering of goods;
-	replenishing vending machines and automated teller machines;
-	services for providing information about journeys or the transport of goods by brokers and tourist agencies, as well as for providing information relating to fares, timetables and methods of transport;
-	inspection of vehicles or goods for the purpose of transport;
-	distribution of energy and electricity, as well as distribution and supply of water.
This Class does not include, in particular:
-	advertising travel or transport (Cl. 35);
-	insurance services during the transport of people or goods (Cl. 36);
-	maintenance and repair of vehicles or other items connected with the transport of people or goods (Cl. 37);
-	conducting guided tours (Cl. 41);
-	electronic data storage (Cl. 42);
-	reservation of hotel rooms or other temporary accommodation by travel agents or brokers (Cl. 43).

Class 40
Treatment of materials; recycling of waste and trash; air purification and treatment of water; printing services; food and drink preservation.
Explanatory Note
Class 40 includes mainly services rendered by the mechanical or chemical processing, transformation or production of objects or inorganic or organic substances, including custom manufacturing services. For the purposes of classification, the production or manufacturing of goods is considered a service only in cases where it is effected for the account of another person to their order and specification. If the production or manufacturing is not being performed to fulfil an order for goods which meet the customer's particular needs, requirements, or specifications, then it is generally ancillary to the maker's primary commercial activity or goods in trade. If the substance or object is marketed to third parties by the person who processed, transformed or produced it, then this would generally not be considered a service.
This Class includes, in particular:
-	transformation of an object or substance and any process involving a change in its essential properties, for example, dyeing a garment; such transformation services are also classified in Class 40 if they are provided in the framework of repair or maintenance work, for example, chromium plating of motor vehicle bumpers;
-	services of material treatment which may be present during the production of any substance or object other than a building, for example, services which involve cutting, shaping, polishing by abrasion or metal coating;
-	joining of materials, for example, soldering or welding;
-	processing and treatment of foodstuffs, for example, fruit crushing, flour milling, food and drink preservation, food smoking, freezing of foods;
-	custom manufacturing of goods to the order and specification of others (bearing in mind that certain offices require that the goods produced be indicated), for example, custom manufacturing of automobiles;
-	quilting, embroidering, custom tailoring, textile dyeing, applying finishes to textiles.
This Class does not include, in particular:
-	services that do not entail a change in the essential properties of the object or substance, for example, furniture maintenance or repair (Cl. 37);
-	services in the field of construction, for example, painting and plastering (Cl. 37);
-	cleaning services, for example, laundering, window cleaning, cleaning of interior and exterior surfaces of buildings (Cl. 37);
-	rustproofing, for example, anti-rust treatment for vehicles (Cl. 37);
-	certain customization services, for example, the custom painting of automobiles (Cl. 37);
-	decorating of food, food sculpting (Cl. 43).

Class 41
Education; providing of training; entertainment; sporting and cultural activities.
Explanatory Note
Class 41 includes mainly services consisting of all forms of education or training, services having the basic aim of the entertainment, amusement or recreation of people, as well as the presentation of works of visual art or literature to the public for cultural or educational purposes.
This Class includes, in particular:
-	organization of exhibitions for cultural or educational purposes, arranging and conducting of conferences, congresses and symposiums;
-	translation and language interpretation services;
-	publication of books and texts, other than publicity texts;
-	news reporters services, photographic reporting;
-	photography;
-	film direction and production services, other than for advertising films;
-	cultural, educational or entertainment services provided by amusement parks, circuses, zoos, art galleries and museums;
-	sports and fitness training services;
-	training of animals;
-	online gaming services;
-	gambling services, organization of lotteries;
-	ticket reservation and booking services for entertainment, educational and sporting events;
-	certain writing services, for example, screenplay writing, songwriting.
This Class does not include, in particular:
-	organization of exhibitions for commercial or advertising purposes (Cl. 35);
-	writing and publication of publicity texts (Cl. 35);
-	news agency services (Cl. 38);
-	radio and television broadcasting (Cl. 38);
-	videoconferencing services (Cl. 38);
-	technical writing (Cl. 42);
-	day-nursery and crèche services (Cl. 43);
-	health spa services (Cl. 44);
-	planning and arranging wedding ceremonies (Cl. 45).

Class 42
Scientific and technological services and research and design relating thereto; industrial analysis, industrial research and industrial design services; quality control and authentication services; design and development of computer hardware and software.
Explanatory Note
Class 42 includes mainly services provided by persons in relation to the theoretical and practical aspects of complex fields of activities, for example, scientific laboratory services, engineering, computer programming, architectural services or interior design.
This Class includes, in particular:
-	services of engineers and scientists who undertake evaluations, estimates, research and reports in the scientific and technological fields, including technological consultancy;
-	computer and technology services for securing computer data and personal and financial information and for the detection of unauthorized access to data and information, for example, computer virus protection services, data encryption services, electronic monitoring of personally identifying information to detect identity theft via the internet;
-	software as a service (SaaS), platform as a service (PaaS);
-	scientific research services for medical purposes;
-	architectural and urban planning services;
-	certain design services, for example, industrial design, design of computer software and systems, interior design, packaging design, graphic arts design, dress designing;
-	surveying (engineering);
-	oil, gas and mining exploration services.
This Class does not include, in particular:
-	certain research services, for example, business research (Cl. 35), marketing research (Cl. 35), financial research (Cl. 36), research in the field of education (Cl. 41), genealogical research (Cl. 45), legal research (Cl. 45);
-	business auditing (Cl. 35);
-	computerized file management (Cl. 35);
-	financial evaluation services (Cl. 36);
-	mining extraction, oil and gas drilling (Cl. 37);
-	installation, maintenance and repair of computer hardware (Cl. 37);
-	sound engineering services (Cl. 41);
-	certain design services, for example, landscape design (Cl. 44);
-	medical and veterinary services (Cl. 44);
-	legal services (Cl. 45).

Class 43
Services for providing food and drink; temporary accommodation.
Explanatory Note
Class 43 includes mainly services provided in relation to the preparation of food and drink for consumption, as well as services for providing temporary accommodation.
This Class includes, in particular:
-	temporary accommodation reservations, for example, hotel reservations;
-	boarding for animals;
-	rental of meeting rooms, tents and transportable buildings;
-	retirement home services;
-	day-nursery and crèche services;
-	decorating of food, food sculpting;
-	rental of cooking apparatus;
-	rental of chairs, tables, table linen, glassware;
-	hookah lounge services;
-	personal chef services.
This Class does not include, in particular:
-	business management of hotels (Cl. 35);
-	rental services for real estate, such as houses or flats, for residential use (Cl. 36);
-	housekeeping (cleaning) services (Cl. 37);
-	travel and transport reservation services (Cl. 39);
-	beer brewing and wine making for others, custom manufacturing of bread (Cl. 40);
-	food smoking, food and drink preservation (Cl. 40);
-	educational, instruction and entertainment services, including those that might involve ancillary lodging or food and drink, provided by, for example, boarding schools, nursery schools, sport camps, discotheques and nightclubs (Cl. 41);
-	providing museum facilities (Cl. 41);
-	convalescent home and rest home services (Cl. 44);
-	babysitting, pet sitting (Cl. 45).

Class 44
Medical services; veterinary services; hygienic and beauty care for human beings or animals; agriculture, aquaculture, horticulture and forestry services.
Explanatory Note
Class 44 includes mainly medical care, including alternative medicine, hygienic and beauty care given by persons or establishments to human beings and animals, as well as services relating to the fields of agriculture, aquaculture, horticulture and forestry.
This Class includes, in particular:
-	hospital services;
-	telemedicine services;
-	dentistry, optometry and mental health services;
-	medical clinic services and medical analysis services for diagnostic and treatment purposes provided by medical laboratories, such as x-ray examinations and taking of blood samples;
-	therapy services, for example, physiotherapy and speech therapy;
-	pharmacy advice and preparation of prescriptions by pharmacists;
-	blood bank and human tissue bank services;
-	convalescent home and rest home services;
-	dietary and nutritional advice;
-	health spa services;
-	artificial insemination and in vitro fertilization services;
-	animal breeding;
-	animal grooming;
-	body piercing and tattooing;
-	services relating to gardening, for example, plant nursery services, landscape design, landscape gardening, lawn care;
-	services relating to floral art, for example, flower arranging, wreath making;
-	weed killing, vermin and pest control for agriculture, aquaculture, horticulture and forestry.
This Class does not include, in particular:
-	rental of pastures (Cl. 36);
-	vermin and pest control, other than for agriculture, aquaculture, horticulture and forestry (Cl. 37);
-	installation and repair services for irrigation devices (Cl. 37);
-	ambulance transport (Cl. 39);
-	slaughtering of animals and taxidermy (Cl. 40);
-	timber felling and processing (Cl. 40);
-	animal training services (Cl. 41);
-	health clubs for physical exercise (Cl. 41);
-	scientific research services for medical purposes (Cl. 42);
-	boarding for animals (Cl. 43);
-	retirement homes (Cl. 43);
-	funerary undertaking (Cl. 45).

Class 45
Legal services; security services for the physical protection of tangible property and individuals; dating services, online social networking services; funerary services; babysitting.
Explanatory Note
Class 45 includes mainly legal and security services, as well as certain personal and social services rendered by others to meet the needs of individuals.
This Class includes, in particular:
-	arbitration and mediation services;
-	registration of domain names;
-	legal and regulatory compliance auditing services;
-	investigation and surveillance services relating to the physical safety of individuals and security of tangible property, for example, guard services, detective agency services, personal background investigations, security screening of baggage;
-	services provided to individuals in relation to social events, for example, chaperoning, planning and arranging of wedding ceremonies;
-	conducting religious ceremonies, burial services;
-	pet sitting, dog walking services;
-	clothing rental.
This Class does not include, in particular:
-	certain rental services rendered by others to meet the needs of individuals, where the services provided by means of the rented objects belong to another class, for example, rental of apartments (Cl. 36), car rental (Cl. 39), rental of temporary accommodation (Cl. 43);
-	escorting of travellers (Cl. 39);
-	secure transport, for example, guarded transport of valuables, armoured car transport (Cl. 39);
-	party planning (Cl. 41);
-	services consisting of all forms of education, including religious education (Cl. 41);
-	services having the basic aim of the entertainment, amusement or recreation of people (Cl. 41);
-	computer and internet security consultancy and data encryption services (Cl. 42);
-	providing medical, hygienic or beauty care for human beings or animals (Cl. 44).
"""

# Global configuration
CONCURRENT_LIMIT = 20
search_cache: Dict[str, str] = {}
CANCELLATION_FILE = "cancel_search.tmp" # File to signal cancellation
MGS_BASE_URL = "https://webaccess.wipo.int/mgs/"

# Gemini API Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    # Use stderr for error messages that shouldn't be parsed as JSON results
    sys.stderr.write("ERROR: GEMINI_API_KEY environment variable not set.\n")
    # Optionally, print a JSON error message to stdout as well if the main process expects it
    print(json.dumps({"type": "error", "message": "GEMINI_API_KEY environment variable not set."}))
    sys.exit(1) # Exit if the key is missing

try:
    genai.configure(api_key=GEMINI_API_KEY)
    # Consider making the model name configurable too, but hardcoding for now
    gemini_model = genai.GenerativeModel('gemini-1.5-flash-latest') # Using latest flash model
    sys.stderr.write("DEBUG: Gemini configured successfully.\n")
except Exception as gemini_config_error:
    sys.stderr.write(f"ERROR: Failed to configure Gemini: {gemini_config_error}\n")
    print(json.dumps({"type": "error", "message": f"Failed to configure Gemini: {gemini_config_error}"}))
    sys.exit(1)


def is_subsequence(small: List[str], big: List[str]) -> bool:
    it = iter(big)
    return all(word in it for word in it)

def normalize_text(text: str) -> str:
    text = text.replace('-', '').replace(',', '')
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()
    return text.lower()

async def wait_for_results_update(page) -> None:
    await page.wait_for_function(
        "document.querySelector('span.page-results') && document.querySelector('span.page-results').textContent.trim() !== ''",
        timeout=0
    )

async def binary_search_partial(term: str, page, base_url: str, cancel_event: asyncio.Event) -> Optional[str]:
    # Split individual term into words (not the whole input string)
    words = term.strip().split()  # Remove potential whitespace and split into words
    lo, hi = 1, len(words)
    best: Optional[str] = None
    while lo <= hi:
        if cancel_event.is_set() or os.path.exists(CANCELLATION_FILE): # Check for cancellation file
            return None
        mid = (lo + hi) // 2
        prefix = " ".join(words[:mid])
        await page.goto(base_url, wait_until="networkidle", timeout=0)
        await page.wait_for_selector("div.main-search input.search-term", timeout=30000)
        await page.fill("div.main-search input.search-term", prefix)
        await page.press("div.main-search input.search-term", "Enter")
        try:
            await wait_for_results_update(page)
        except asyncio.TimeoutError:
            partial_content = ""
        else:
            partial_content = (await page.text_content("span.page-results")) or ""
        if partial_content and "Displaying" in partial_content:
            best = prefix
            lo = mid + 1
        else:
            hi = mid - 1
    return best

def list_gemini_models(): # Debug function - keep it, redirect output to stderr
    sys.stderr.write("DEBUG: Listing available Gemini models:\n")
    for model in genai.list_models():
        sys.stderr.write(f"DEBUG: Model: {model.name}\n")
        for method in model.supported_generation_methods:
            sys.stderr.write(f"DEBUG:   - Supports method: {method}\n")

def normalize_vagueness_result(classification: str, reasoning: str) -> Tuple[str, str]:
    """Normalize vagueness classification and reasoning to ensure consistent format."""
    # Standardize classification to title case
    classification = "Vague" if classification.lower() == "vague" else "Not Vague"
    # Clean up reasoning text
    reasoning = reasoning.strip()
    return classification, reasoning

def analyze_vagueness_gemini(description_text): # Keep Gemini analysis function as is, it's backend logic
    prompt = f"""
You are a United States Trademark Examiner. Your task is to analyze trademark descriptions and determine if they are likely to be considered vague and unacceptable according to USPTO guidelines.

A vague trademark description is one that is:
- Overly broad, encompassing too many unrelated goods or services.
- Indefinite or unclear in meaning.
- Primarily describes the function or purpose of goods/services rather than the goods/services themselves.
- Lacks clarity or uses jargon unfamiliar to the general public.

Here are some examples of vague and non-vague descriptions:
Vague Example 1: 'Goods and services in Class 9'
Not Vague Example 1: 'Downloadable software for editing videos'
Vague Example 2: 'Miscellaneous products'
Not Vague Example 2: 'Leather wallets'

Now, analyze the following trademark description and **first, clearly classify it as either "Vague" or "Not Vague".  Then, briefly explain your reasoning** based on the criteria for vagueness outlined above.

Trademark Description: {description_text}

**Classification: [Vague or Not Vague]**
Reasoning: [AI's Explanation]
"""
    sys.stderr.write(f"DEBUG: analyze_vagueness_gemini called with description: {description_text}\n")
    # list_gemini_models() # Commented out for less verbose debug output

    try:
        sys.stderr.write(f"DEBUG: Sending prompt to Gemini API: {prompt}\n")
        response = gemini_model.generate_content(prompt)
        ai_response_text = response.text
        sys.stderr.write(f"DEBUG: Gemini API Response Text: {ai_response_text}\n")

        classification = "Unknown"
        reasoning = "No reasoning provided."

        if ai_response_text:
            vague_match = re.search(r"Classification:\s*:?\s*(Vague|Not Vague)", ai_response_text, re.IGNORECASE)
            if vague_match:
                classification = vague_match.group(1).strip()
            else:
                lower_text = ai_response_text.lower()
                if "vague" in lower_text:
                    if "not vague" in lower_text:
                        vague_pos = lower_text.find("vague")
                        not_vague_pos = lower_text.find("not vague")
                        if not_vague_pos < vague_pos and not_vague_pos != -1:
                            classification = "Not Vague"
                        else:
                            classification = "Vague"
                    else:
                        classification = "Vague"
                else:
                    classification = "Not Vague"

            sys.stderr.write(f"DEBUG: analyze_vagueness_gemini - After Regex - Classification: {classification}\n")

            reasoning_match = re.search(r"Reasoning:\s*\[AI's Explanation\]\s*(.+)", ai_response_text, re.DOTALL)
            if reasoning_match:
                reasoning = reasoning_match.group(1).strip()
            else:
                reasoning_match_fallback = re.search(r"Reasoning:\s*(.+)", ai_response_text, re.DOTALL)
                if reasoning_match_fallback:
                    reasoning = reasoning_match_fallback.group(1).strip()

            sys.stderr.write(f"DEBUG: [VAGUENESS_ANALYSIS] Raw API Response: {ai_response_text}\n")
            sys.stderr.write(f"DEBUG: [VAGUENESS_ANALYSIS] Pre-normalized Classification: {classification}\n")
            sys.stderr.write(f"DEBUG: [VAGUENESS_ANALYSIS] Pre-normalized Reasoning: {reasoning}\n")

            # Add normalization before returning
            classification, reasoning = normalize_vagueness_result(classification, reasoning)
            
            sys.stderr.write(f"DEBUG: [VAGUENESS_ANALYSIS] Post-normalized Classification: {classification}\n")
            sys.stderr.write(f"DEBUG: [VAGUENESS_ANALYSIS] Post-normalized Reasoning: {reasoning}\n")

        sys.stderr.write(f"DEBUG: Gemini Analysis - Classification: {classification}, Reasoning: {reasoning}\n")
        return classification, reasoning

    except Exception as e:
        error_message = str(e)
        sys.stderr.write(f"DEBUG: Error in analyze_vagueness_gemini: {error_message}\n")
        # Fallback logic removed for simplicity in debugging, directly return error
        return "Error", f"Gemini API Error: {error_message}"

# --- New Function for Suggesting Alternatives ---
def suggest_alternatives_gemini(original_term: str, vagueness_reason: str, example_description: Optional[str]):
    """Uses Gemini AI to suggest alternative phrasings and classify them according to NICE."""
    sys.stderr.write(f"DEBUG: suggest_alternatives_gemini called with term='{original_term}', reason='{vagueness_reason}', example='{example_description}'\n")

    # --- Construct the Enhanced Prompt ---
    prompt_lines = [
        "You are an expert assistant helping users refine trademark descriptions to meet USPTO ID Manual standards and classify them according to the NICE classification.",
        "\nFIRST, here is the full text of the NICE Classification (Classes 1-45) including Explanatory Notes:",
        "--- START NICE CLASSIFICATION ---",
        NICE_CLASSIFICATION_TEXT,
        "--- END NICE CLASSIFICATION ---",
        f"\nSECOND, the user provided the description: \"{original_term}\"",
        f"This description was flagged as potentially vague for the following reason: \"{vagueness_reason}\""
    ]

    if example_description:
        prompt_lines.append(f"During the search, the following related example description was found: \"{example_description}\"")
        # --- MODIFIED INSTRUCTION ---
        prompt_lines.append(f"\nTHIRD, based on the vagueness reason AND the provided example, suggest 3-5 alternative phrasings for \"{original_term}\". **Crucially, EACH alternative MUST start with the exact phrase: \"{example_description}\"**. Ensure the alternatives are specific, distinct, likely acceptable, and relevant to the original term and the example's context, following USPTO ID Manual style.")
        # --- END MODIFICATION ---
    else:
        prompt_lines.append(f"\nTHIRD, based on the vagueness reason, suggest 3-5 alternative phrasings for \"{original_term}\" that are more specific and likely to be acceptable, following the style and specificity found in the USPTO ID Manual.")

    prompt_lines.extend([
        "\nFOURTH, for EACH suggestion, determine the single most appropriate NICE class number based ONLY on the NICE Classification text provided above.",
        "\nFIFTH, format your response ONLY as a JSON list of objects, where each object has a 'suggestion' key (string) and a 'class' key (integer number or null if unclassifiable based on the provided text).",
        "Example JSON format: [{\"suggestion\": \"Downloadable software for accounting purposes\", \"class\": 9}, {\"suggestion\": \"Business management consulting services\", \"class\": 35}]",
        "\nGenerate the JSON output now:"
    ])

    prompt = "\n".join(prompt_lines)

    try:
        sys.stderr.write(f"DEBUG: Sending suggestion prompt to Gemini API (length: {len(prompt)} chars)\n") # Log length for debugging limits
        # Consider adding safety settings if needed:
        # safety_settings = [
        #     {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
        #     {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
        #     {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
        #     {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
        # ]
        # response = gemini_model.generate_content(prompt, safety_settings=safety_settings)
        response = gemini_model.generate_content(prompt)

        ai_response_text = response.text
        sys.stderr.write(f"DEBUG: Gemini API Suggestion Response Text:\n{ai_response_text}\n")

        # --- Parse the JSON response ---
        suggestions_with_class = []
        try:
            # Attempt to find JSON list within the response text (sometimes AI adds preamble/postamble)
            json_match = re.search(r"\[\s*\{.*\}\s*\]", ai_response_text, re.DOTALL)
            if json_match:
                json_string = json_match.group(0)
                parsed_response = json.loads(json_string)
                if isinstance(parsed_response, list):
                    for item in parsed_response:
                        if isinstance(item, dict) and 'suggestion' in item and 'class' in item:
                             # Ensure class is an integer or None
                             cls = item.get('class')
                             if isinstance(cls, int) and 1 <= cls <= 45:
                                 suggestion_class = cls
                             else:
                                 suggestion_class = None # Default to None if invalid or not found

                             suggestions_with_class.append({
                                "suggestion": str(item.get('suggestion', '')),
                                "class": suggestion_class
                             })
                        else:
                             sys.stderr.write(f"WARN: Skipping invalid item in JSON response: {item}\n")
                else:
                     raise ValueError("Parsed JSON is not a list.")
            else:
                 raise ValueError("No valid JSON list found in AI response.")

        except (json.JSONDecodeError, ValueError) as parse_error:
             sys.stderr.write(f"ERROR: Failed to parse JSON response from AI: {parse_error}\nRaw response was: {ai_response_text}\n")
             # Fallback: Try to extract suggestions as plain text if JSON fails? Or just return error.
             # For now, return error.
             return {"error": f"Failed to parse AI response: {parse_error}"}


        sys.stderr.write(f"DEBUG: Extracted Suggestions with Class: {suggestions_with_class}\n")
        return suggestions_with_class # Return the list of objects

    except Exception as e:
        # Catch potential API errors or other exceptions
        error_message = f"Error during Gemini API call or processing: {e}"
        sys.stderr.write(f"DEBUG: Error in suggest_alternatives_gemini: {error_message}\n")
        # Return error information in a structured way if possible
        return {"error": f"Failed to get suggestions: {error_message}"}


async def search_mgs_term(term: str, context, cancel_event: asyncio.Event, semaphore: asyncio.Semaphore, nice_filter: bool) -> Tuple[str, str]:
    """Searches for a term in the Madrid Goods & Services Manager (MGS) with debugging."""
    if cancel_event.is_set() or os.path.exists(CANCELLATION_FILE):
        return term, "Cancelled"

    async with semaphore:
        page = await context.new_page()
        try:
            await page.goto(MGS_BASE_URL, wait_until="networkidle", timeout=0)
            search_tab_selector = 'xpath=//input[@id="btnSearch"]'
            await page.click(search_tab_selector)
            await page.wait_for_selector("input#searchInputBox.dummyClass", timeout=30000)
            await page.fill("input#searchInputBox.dummyClass", term)
            nice_filter_checkbox_selector = 'input#checkNiceFilterSearch'
            if nice_filter:
                await page.check(nice_filter_checkbox_selector)
            else:
                await page.uncheck(nice_filter_checkbox_selector)
            await page.click('span#searchButton')

            results_container_selector = 'div#divHitList'
            await page.wait_for_selector(results_container_selector, timeout=30000)

            no_results_banner = await page.query_selector('div#divHitList > div#hitListBanner:has-text("No results")')
            if no_results_banner:
                return term, f"MGS No Match (NICE {'On' if nice_filter else 'Off'})"

            full_match_found = False
            results_list = await page.query_selector('div#divHitList > ul')
            if results_list:
                list_items = await results_list.query_selector_all('li')
                for item in list_items:
                    item_html_content = await item.inner_html()  # Capture raw HTML of the list item
                    description_text = (await item.text_content()).strip()
                    normalized_description_text = normalize_text(description_text)
                    normalized_term = normalize_text(term)
                    match = (normalized_description_text == normalized_term)

                    sys.stderr.write(f"DEBUG: MGS - Term: '{term}', NICE Filter: {'ON' if nice_filter else 'OFF'}\n")
                    sys.stderr.write(f"DEBUG: MGS - List Item HTML: {item_html_content}\n") # Log raw HTML
                    sys.stderr.write(f"DEBUG: MGS - Extracted Description Text: '{description_text}'\n") # Log extracted text
                    sys.stderr.write(f"DEBUG: MGS - Normalized Description Text: '{normalized_description_text}'\n") # Log normalized text
                    sys.stderr.write(f"DEBUG: MGS - Normalized Search Term: '{normalized_term}'\n") # Log normalized search term
                    sys.stderr.write(f"DEBUG: MGS - Comparison Result: '{match}'\n") # Log comparison result

                    if match:
                        full_match_found = True
                        break

            if full_match_found:
                return term, f"MGS Full Match (NICE {'On' if nice_filter else 'Off'})"
            else:
                return term, f"MGS No Full Match (NICE {'On' if nice_filter else 'Off'})"

        except Exception as e:
            error_message = str(e)
            sys.stderr.write(f"DEBUG: Error in search_mgs_term: {error_message}\n")
            return term, f"MGS Search Error (NICE {'On' if nice_filter else 'Off'}): {error_message}"
        finally:
            await page.close()


async def search_term(term: str, base_url: str, context, cancel_event: asyncio.Event, semaphore: asyncio.Semaphore) -> Tuple[str, str]:
    if cancel_event.is_set() or os.path.exists(CANCELLATION_FILE):
        return term, "Cancelled"
    if term in search_cache:
        # Ensure cached data is returned in the expected format (full object)
        cached_data = search_cache[term]
        if isinstance(cached_data, dict):
             print(json.dumps(cached_data)) # Print cached object if it's already structured
             return term, cached_data.get("statusText", "Cached Status Missing")
        else:
             # If cache contains old format (just status string), handle gracefully or re-fetch
             sys.stderr.write(f"DEBUG: Old cache format found for term: {term}. Re-fetching.\n")
             # Fall through to re-fetch logic
        
    async with semaphore:
        page = await context.new_page()
        try:
            await page.goto(base_url, wait_until="networkidle", timeout=0)
            await page.wait_for_selector("div.main-search input.search-term", timeout=30000)
            await page.fill("div.main-search input.search-term", term)
            await page.press("div.main-search input.search-term", "Enter")
            try:
                await wait_for_results_update(page)
            except asyncio.TimeoutError:
                content = ""
            else:
                content = (await page.text_content("span.page-results")) or ""

            initial_result_type = ""
            full_match_prefix = "Displaying search results for:"
            all_records_prefix = "Displaying all of"

            if content and full_match_prefix in content:
                displayed_term_match = re.search(rf"{re.escape(full_match_prefix)}\s*\"(.+?)\"", content)
                if displayed_term_match:
                    displayed_term = displayed_term_match.group(1).strip()
                    if normalize_text(term) == normalize_text(displayed_term):
                        initial_result_type = "full_match_prefix"
                    else:
                        initial_result_type = "larger_description_prefix"
                else:
                    initial_result_type = "larger_description_prefix_fail"
            elif content and all_records_prefix in content:
                initial_result_type = "larger_description_general"
            elif content and "Displaying" not in content and "No listings found" not in content:
                partial = await binary_search_partial(term, page, base_url, cancel_event)
                if partial:
                    await page.goto(base_url, wait_until="networkidle", timeout=0)
                    await page.wait_for_selector("div.main-search input.search-term", timeout=30000)
                    await page.fill("div.main-search input.search-term", partial)
                    await page.press("div.main-search input.search-term", "Enter")
                    try:
                        await wait_for_results_update(page)
                    except asyncio.TimeoutError:
                        pass

                    description_cells = await page.query_selector_all("td[data-column='description']")

                    found_in_template = False
                    template_text = ""
                    template_id = "Not found"
                    partial_match_description_example = ""
                    partial_match_term_id = "Not found"

                    normalized_partial = normalize_text(partial)
                    partial_words = normalized_partial.split()

                    for cell in description_cells:
                        cell_text = (await cell.text_content()).strip()
                        normalized_cell = normalize_text(cell_text)
                        cell_words = normalized_cell.split()

                        if is_subsequence(partial_words, cell_words):
                            found_in_template = True
                            template_text = cell_text
                            parent_row = await cell.evaluate_handle("node => node.parentElement")
                            id_element = await parent_row.query_selector("a.view-record")
                            if id_element:
                                template_id = (await id_element.text_content()).strip()
                                partial_match_term_id = template_id
                            partial_match_description_example = cell_text
                            break

                    if found_in_template:
                        initial_result_type = "template_match"
                        description_text = template_text
                        term_id_number = template_id
                    else:
                        initial_result_type = "partial"
                        description_text = partial_match_description_example
                        term_id_number = partial_match_term_id

                else:
                    initial_result_type = "no_match"

            description_text = None # Reset before checking descriptions
            term_id_number = "Not found" # Reset before checking descriptions
            is_deleted_description = False
            found_full_description_match = False
            found_in_description = False

            if initial_result_type != "template_match" and initial_result_type != "no_match":
                view_record_link = await page.query_selector("a.view-record")
                if view_record_link:
                    term_id_number = (await view_record_link.text_content()).strip()

                description_cells = await page.query_selector_all("td[data-column='description']")

                matched_cell_text = ""

                for cell in description_cells:
                    cell_text = (await cell.text_content()).strip()
                    normalized_cell_text = normalize_text(cell_text)
                    normalized_term = normalize_text(term)

                    if normalized_term == normalized_cell_text:
                        found_full_description_match = True
                        found_in_description = True
                        description_text = cell_text # Store the exact matching description
                        parent_row = await cell.evaluate_handle("node => node.parentElement")
                        status_element = await parent_row.query_selector("td[data-column='status']")
                        if status_element:
                            status_text = (await status_element.text_content()).strip()
                            if status_text == "D":
                                is_deleted_description = True
                                # description_text remains the matched text even if deleted
                                break # Exit loop once deleted full match found
                        # If not deleted, store ID and break
                        id_element = await parent_row.query_selector("a.view-record")
                        if id_element:
                             term_id_number = (await id_element.text_content()).strip()
                        break # Exit loop once full match found

                    elif normalized_term in normalized_cell_text:
                        found_in_description = True
                        if description_text is None: # Only store the first partial match example
                            description_text = cell_text
                        # Check if this partial match is deleted
                        parent_row = await cell.evaluate_handle("node => node.parentElement")
                        status_element = await parent_row.query_selector("td[data-column='status']")
                        if status_element:
                            status_text = (await status_element.text_content()).strip()
                            if status_text == "D":
                                # If a deleted partial match is found, prioritize it as the example?
                                # Or maybe just note it? For now, let's keep the first non-deleted example if possible.
                                # If description_text is still None, store this deleted one.
                                if description_text is None:
                                     description_text = cell_text
                                     # Potentially mark this example as coming from a deleted entry?
                        # Get Term ID for the first partial match found
                        if term_id_number == "Not found":
                             id_element = await parent_row.query_selector("a.view-record")
                             if id_element:
                                 term_id_number = (await id_element.text_content()).strip()
                        # Don't break here, continue searching for a full match

                # If no description found yet, and it was a binary search partial, use that partial text
                if not found_in_description and initial_result_type == "partial" and partial:
                     description_text = partial # Use the prefix as the example

            vagueness_classification = "Not Analyzed"
            vagueness_reason = ""

            # Always perform vagueness analysis unless it's a non-deleted full match
            if not (found_full_description_match and not is_deleted_description):
                # *** Always analyze the original term for vagueness ***
                text_to_analyze = term

                sys.stderr.write(f"DEBUG: Analyzing original term for vagueness: '{text_to_analyze}'\n")
                
                vagueness_classification, vagueness_reason = analyze_vagueness_gemini(text_to_analyze)
                
                sys.stderr.write(f"DEBUG: Vagueness Analysis Results: Classification='{vagueness_classification}', Reason='{vagueness_reason}'\n")

            # --- Construct Structured Result ---
            result_data = {
                "type": "result",
                "term": term,
                "source": "uspto",
                "matchType": "unknown", # Default value, will be overwritten
                "termId": term_id_number if term_id_number != "Not found" else None,
                "descriptionExample": None, # Initialize
                "isVague": None, # Initialize as None
                "vaguenessReasoning": None, # Initialize as None
                "statusText": "" # Initialize as empty
            }

            # Determine matchType and set descriptionExample and statusText
            if is_deleted_description:
                result_data["matchType"] = "deleted"
                result_data["descriptionExample"] = description_text # Show the deleted description
                result_data["statusText"] = f"Deleted description found (Term ID: {term_id_number})"
            elif found_full_description_match:
                result_data["matchType"] = "full"
                result_data["descriptionExample"] = description_text # Show the matched description
                result_data["statusText"] = f"Full match found (Term ID: {term_id_number})"
            elif initial_result_type == "template_match":
                result_data["matchType"] = "partial"
                result_data["descriptionExample"] = description_text # Example from template
                result_data["statusText"] = f"Apart of a larger description (Example: {description_text}, Term ID: {term_id_number})"
            elif found_in_description:
                 result_data["matchType"] = "partial"
                 result_data["descriptionExample"] = description_text # Example from partial match
                 result_data["statusText"] = f"Apart of a larger description (Example: {description_text or 'N/A'}, Term ID: {term_id_number})"
            elif initial_result_type == "partial" and partial:
                 result_data["matchType"] = "partial"
                 result_data["descriptionExample"] = partial # Example is the prefix
                 result_data["statusText"] = f"Partial prefix match found: '{partial}' (Term ID: {term_id_number}). Consider checking broader term."
            elif initial_result_type == "larger_description_general":
                 result_data["matchType"] = "partial" # Treat as partial
                 # Try to get first description as example
                 first_desc_element = await page.query_selector("td[data-column='description']")
                 first_desc_text = (await first_desc_element.text_content()).strip() if first_desc_element else None
                 result_data["descriptionExample"] = first_desc_text
                 result_data["statusText"] = f"General description listing found (Example: {first_desc_text or 'N/A'}, Term ID: {term_id_number})"
            elif initial_result_type == "no_match":
                 result_data["matchType"] = "none"
                 result_data["statusText"] = "No match found"
            else: # Fallback
                 result_data["matchType"] = "unknown"
                 result_data["statusText"] = f"Unknown match type (Initial: {initial_result_type})"

            # Add vagueness info if analysis was performed and successful
            if vagueness_classification not in ["Not Analyzed", "Error"]:
                result_data["isVague"] = (vagueness_classification == "Vague")
                result_data["vaguenessReasoning"] = vagueness_reason
                # Optionally adjust statusText based on vagueness for non-full/non-deleted matches
                if result_data["matchType"] not in ["full", "deleted"]:
                     if result_data["isVague"]:
                          result_data["statusText"] += " - Potentially Vague"
                     else:
                          result_data["statusText"] += " - Likely Acceptable"


            # Update cache with the structured data
            search_cache[term] = result_data # Cache the whole object

            # Print the structured JSON result to stdout
            sys.stderr.write(f"DEBUG: [FINAL_OUTPUT] Term: {term}, Structured Result: {json.dumps(result_data, indent=2)}\n")
            print(json.dumps(result_data))

            # Return term and statusText (though statusText isn't really used by caller anymore)
            return term, result_data["statusText"]
        finally:
            await page.close()


async def run_searches(terms: List[str], search_type="uspto"):
    base_url_uspto = "https://idm-tmng.uspto.gov/id-master-list-public.html"
    mgs_base_url = "https://webaccess.wipo.int/mgs/" # Correct MGS base URL
    cancel_event = asyncio.Event()
    semaphore = asyncio.Semaphore(CONCURRENT_LIMIT)
    results = {}
    start_time = time.time()

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()

            tasks = []
            for term in terms:
                # Only handle uspto search type in this script
                if search_type == "uspto":
                    task = asyncio.create_task(search_term(term, base_url_uspto, context, cancel_event, semaphore))
                    tasks.append(task)
                else:
                    # Log an error if called with an unexpected type, but don't handle MGS
                    sys.stderr.write(f"ERROR: search_script.py called with invalid search_type: {search_type}\n")
                    print(json.dumps({"type": "error", "message": f"search_script.py does not handle search type '{search_type}'"}))
                    continue # Skip to next term

            completed_count = 0
            total_terms = len(tasks) # Total terms is now just the number of USPTO tasks

            for task in asyncio.as_completed(tasks):
                if os.path.exists(CANCELLATION_FILE):
                    cancel_event.set() # Signal cancellation to other tasks
                    break
                try:
                    # search_term now prints its own JSON result, we just need to wait for completion
                    await task
                    completed_count += 1
                    progress_percent = int((completed_count / total_terms) * 100) if total_terms > 0 else 0
                    print(json.dumps({"type": "progress", "value": progress_percent}))
                except asyncio.CancelledError:
                    sys.stderr.write("DEBUG: A search task was cancelled.\n")
                    # Don't print cancellation here, rely on individual tasks or final check
                except Exception as e:
                    # This might catch errors from within search_term if not handled there
                    error_message = str(e)
                    sys.stderr.write(f"ERROR: Uncaught exception during task execution: {error_message}\n")
                    # Attempt to determine the term if possible (might be difficult here)
                    print(json.dumps({"type": "error", "term": "Unknown", "source": "uspto", "message": f"Unhandled error: {error_message}"}))

            # Check if cancellation happened
            if cancel_event.is_set():
                 print(json.dumps({"type": "result", "term": "Cancelled", "source": "uspto", "matchType": "cancelled", "statusText": "Search Cancelled"}))


            await context.close()
            await browser.close()

    except Exception as e:
        error_message = str(e)
        print(json.dumps({"type": "error", "message": f"Error during search setup or browser operation: {error_message}"}))

    elapsed_time = time.time() - start_time
    # Send final time report
    print(json.dumps({"type": "search_time", "source": search_type, "value": f"{elapsed_time:.2f} seconds"}))
    # run_searches doesn't need to return results dict anymore as results are printed directly
    # return results

if __name__ == "__main__":
    # --- Argument Parsing and Mode Handling ---
    # Define the parser *once* at the beginning of the block
    import argparse
    parser = argparse.ArgumentParser(description='USPTO/MGS Search and AI Analysis Script')

    # Mode arguments (mutually exclusive)
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument('--suggest', action='store_true', help='Run in suggestion mode')
    mode_group.add_argument('--vagueness-only', action='store_true', help='Run only vagueness analysis for a single term') # New mode

    # Arguments for suggestion mode (only relevant if --suggest is used)
    parser.add_argument('--term', help='The term for suggestion or vagueness-only mode')
    parser.add_argument('--reason', help='The reason the term is vague (for suggestion mode)')
    parser.add_argument('--example', help='An example description found during search (optional, for suggestion mode)')

    # Arguments for search mode (default if --suggest or --vagueness-only are not used)
    parser.add_argument('--search_type', default='uspto', choices=['uspto'], help='Type of search to perform (only uspto supported by this script)') # Only uspto now
    # Optional positional argument for search terms string
    parser.add_argument('search_terms_string', nargs='?', default=None, help='Semicolon/newline separated search terms (for search mode)')

    # Parse arguments
    args = parser.parse_args()

    # --- Mode Handling ---

    if args.vagueness_only:
        # --- Vagueness Only Mode ---
        if not args.term:
            print(json.dumps({"type": "error", "message": "--term is required for --vagueness-only mode."}))
            sys.exit(1)

        sys.stderr.write(f"DEBUG: Running in Vagueness Only Mode for term: '{args.term}'\n")
        if not GEMINI_API_KEY:
             print(json.dumps({"type": "error", "message": "GEMINI_API_KEY not configured for vagueness check."}))
             sys.exit(1)
        try:
             # Ensure configuration happens if not already done
             if 'gemini_model' not in globals():
                  genai.configure(api_key=GEMINI_API_KEY)
                  gemini_model = genai.GenerativeModel('gemini-1.5-flash-latest')

             classification, reasoning = analyze_vagueness_gemini(args.term)
             # Print ONLY the vagueness result JSON
             print(json.dumps({
                 "type": "vagueness_result", # Specific type for this mode
                 "term": args.term,
                 "isVague": classification == "Vague",
                 "vaguenessReasoning": reasoning if classification != "Error" else None,
                 "error": reasoning if classification == "Error" else None
             }))
             sys.exit(0) # Exit successfully after printing result
        except Exception as vague_error:
             sys.stderr.write(f"ERROR: Exception during vagueness analysis: {vague_error}\n")
             print(json.dumps({"type": "error", "term": args.term, "message": f"Failed to analyze vagueness: {vague_error}"}))
             sys.exit(1)

    elif args.suggest:
        # --- Suggestion Mode ---
        if not args.term or not args.reason:
            print(json.dumps({"type": "error", "message": "--term and --reason are required for --suggest mode."}))
            sys.exit(1)

        sys.stderr.write("DEBUG: Running in Suggestion Mode\n")
        # Make sure Gemini is configured before calling the function
        if not GEMINI_API_KEY:
             print(json.dumps({"type": "error", "message": "GEMINI_API_KEY not configured for suggestions."}))
             sys.exit(1)
        try:
             # Ensure configuration happens if not already done (though it should be at top level)
             if 'gemini_model' not in globals():
                  genai.configure(api_key=GEMINI_API_KEY)
                  gemini_model = genai.GenerativeModel('gemini-1.5-flash-latest')

             suggestions = suggest_alternatives_gemini(args.term, args.reason, args.example)
             print(json.dumps({"type": "suggestions", "term": args.term, "suggestions": suggestions}))
        except Exception as suggest_error:
             # Catch potential errors during suggestion call itself
             sys.stderr.write(f"ERROR: Exception during suggestion generation: {suggest_error}\n")
             print(json.dumps({"type": "error", "message": f"Failed to generate suggestions: {suggest_error}"}))
             sys.exit(1)

    elif args.vagueness_only:
        # --- Vagueness Only Mode ---
        if not args.term:
            print(json.dumps({"type": "error", "message": "--term is required for --vagueness-only mode."}))
            sys.exit(1)

        sys.stderr.write(f"DEBUG: Running in Vagueness Only Mode for term: '{args.term}'\n")
        if not GEMINI_API_KEY:
             print(json.dumps({"type": "error", "message": "GEMINI_API_KEY not configured for vagueness check."}))
             sys.exit(1)
        try:
             # Ensure configuration happens if not already done
             if 'gemini_model' not in globals():
                  genai.configure(api_key=GEMINI_API_KEY)
                  gemini_model = genai.GenerativeModel('gemini-1.5-flash-latest')

             classification, reasoning = analyze_vagueness_gemini(args.term)
             # Print ONLY the vagueness result JSON
             print(json.dumps({
                 "term": args.term,
                 "isVague": classification == "Vague",
                 "vaguenessReasoning": reasoning if classification != "Error" else None,
                 "error": reasoning if classification == "Error" else None
             }))
        except Exception as vague_error:
             sys.stderr.write(f"ERROR: Exception during vagueness analysis: {vague_error}\n")
             print(json.dumps({"type": "error", "term": args.term, "message": f"Failed to analyze vagueness: {vague_error}"}))
             sys.exit(1)

    else:
        # --- Search Mode (Default) ---
        # Check if search_terms_string was provided
        if args.search_terms_string is None:
             # Check if input is being piped
             if not sys.stdin.isatty():
                  description_text = sys.stdin.read()
                  sys.stderr.write("DEBUG: Reading search terms from stdin.\n")
             else:
                  print(json.dumps({"type": "error", "message": "Search terms string is required when not using --suggest or --vagueness-only mode and not piping input."}))
                  sys.exit(1)
        else:
             description_text = args.search_terms_string
             sys.stderr.write("DEBUG: Reading search terms from command line argument.\n")


        search_type = args.search_type.lower()
        if search_type not in ["uspto"]: # Only USPTO is handled by this script's run_searches
             print(json.dumps({"type": "error", "message": f"Invalid or unsupported search type for this script: {search_type}"}))
             sys.exit(1)

        if os.path.exists(CANCELLATION_FILE):
            try:
                os.remove(CANCELLATION_FILE)
                sys.stderr.write("DEBUG: Removed existing cancellation file.\n")
            except OSError as e:
                sys.stderr.write(f"WARN: Could not remove cancellation file: {e}\n")


        # Get terms from the description text (either from arg or stdin)
        terms = [term.strip() for term in re.split(r'[\n;]+', description_text) if term.strip()]

        if not terms:
             print(json.dumps({"type": "error", "message": "No valid search terms found."}))
             sys.exit(1)

        sys.stderr.write(f"DEBUG: Running in Search Mode (Type: {search_type}), Terms: {terms}\n")
        # Run the main search workflow
        asyncio.run(run_searches(terms, search_type))
