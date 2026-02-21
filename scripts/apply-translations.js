const { MongoClient } = require('mongodb');
const config = require('../src/config');

const translations = {
  "1 Bedroom Hall Brand New Villa Parking Near Mushrif Mall Abu Dhabi": "阿布扎比 Mushrif Mall 附近全新别墅一室一厅带停车位",
  "1BHK BRAND NEW MONTHLY BASIS WITH PARKING 5500 AED": "全新一室一厅 月租 5500 迪拉姆 带停车位",
  "1BHK Chiller-Free Flat for Rent in Shabiya 10 – AED 60K | 4 Payments": "Shabiya 10 免空调费一室一厅公寓出租 - 6万迪拉姆 4次付款",
  "1BHK/Owner property/Wardrobe/Central AC/ Shabiya 9": "Shabiya 9 业主房源 一室一厅 带衣柜 中央空调",
  "1BR+Store Room | Mangrove View | 1 Payment": "一室一厅+储藏室 | 红树林景观 | 1次付款",
  "1st Tenant Luxury 1Bedroom+Kitchen+Washroom 60K": "首租豪华一居室+厨房+洗手间 6万",
  "6400/month amazing finishing fully furnished 1 B/R hall with proper kitchen and bathtub": "月租6400 精装修全家具一室一厅 带独立厨房和浴缸",
  "Al Muntazah 1 BR Apartment": "Al Muntazah 一居室公寓",
  "Amazing 1BhK in villa neat and clean All included rent for family": "优质别墅内一室一厅 整洁干净 租金全包 适合家庭",
  "American Style Very Big 1Bedroom+ Kitchen+ separate Washroom": "美式超大一居室+厨房+独立洗手间",
  "Available Soon I From Owner I Prime Location": "即将上市 | 业主直租 | 黄金地段",
  "BEAUTIFUL 1BHK FOR RENT IN MBZ CITY 4300 PER MONTHS": "MBZ City 精美一室一厅出租 月租 4300",
  "BRAND NEW 1 BEDROOMS HALL WITH 2 BATHS CLOSE TO CARREFOUR MBZ CITY": "MBZ City 家乐福附近 全新一室一厅双卫",
  "BRAND NEW FULLY FURNISHED 1BHK WITH BALCONY IN KCA": "KCA 全新全家具一室一厅带阳台",
  "BRAND NEW ONE BEDROOM APARTMENT": "全新一居室公寓",
  "BRAND NEW ONE BEDROOM HALL PROPER KITCHEN & WASHROOM | IN A PRIME LOCATION IN MBZ": "MBZ 黄金地段 全新一室一厅独立厨卫",
  "BRAND NEW SPACIOUS APARTMENT AVAILABLE IN MBZ": "MBZ 全新宽敞公寓招租",
  "Balcony | Ready to Move | Prime Location": "阳台 | 拎包入住 | 黄金地段",
  "Brand New 1 Bedroom Apartment For 65K In MBZ City": "MBZ City 全新一居室公寓 6.5万",
  "Brand New 1 Bedroom for Rent in Zayed City": "Zayed City 全新一居室出租",
  "Brand New 1Bhk Apt With 2 Bathroom Big Kitchen": "全新一室一厅公寓 双卫大厨房",
  "Brand New 1bhk With 2 Washroom & Private Entrance Mbz": "MBZ 全新一室一厅双卫 独立入口",
  "Brand New 1st Tenant PVT/Balcony 1bhk Sep/Kitchen Proper Washroom In KCA": "KCA 首租全新一室一厅 独立阳台 独立厨房 独立洗手间",
  "Brand New Fully Furnished Studio Sep/kitchen Proper Washroom On prime location In KCA": "KCA 黄金地段 全新全家具开间 独立厨卫",
  "Brand New Luxury 1bhk Available In Mbz City": "MBZ City 全新豪华一室一厅",
  "Brand New One Bedroom Hall With Elegent Interior Design And Balcony Available in Mbz City": "MBZ City 全新一室一厅 优雅设计带阳台",
  "Brand New One Bedroom Hall With Shared Terrace Sep/Kitchen & Luxury Washroom On a Prime Location In KCA": "KCA 黄金地段 全新一室一厅 共享露台 独立厨房 豪华洗手间",
  "Brand New One Bedroom studio for rent in Building in MBZ ME10": "MBZ ME10 全新一居室开间出租",
  "Brand new 1-bed flat for rent in Baniyas East-11": "Baniyas East-11 全新一居室公寓出租",
  "Brand new 1-bed flat for rent in MBZ City": "MBZ City 全新一居室公寓出租",
  "Brand new 1bed, 2 bath flat for rent in Zayed City": "Zayed City 全新一室两卫公寓出租",
  "Brand new | Modern 1BHK |Ready to move|Separate kitchen and bathroom": "全新 | 现代一室一厅 | 拎包入住 | 独立厨卫",
  "Brand new-Amazing cozy 1/BHK | Wardrobe | Bathtub | Sep. kitchen | covered parking": "全新温馨一室一厅 | 带衣柜 | 浴缸 | 独立厨房 | 室内停车",
  "Brand new-Amazing cozy 1/BHK | Wardrobe | Bathtub | Sep.kitchen | covered parking": "全新温馨一室一厅 | 带衣柜 | 浴缸 | 独立厨房 | 室内停车位",
  "Brand new-Modern spacious 1/BHK | Sep. kitchen | Modern bath | Parking": "全新现代宽敞一室一厅 | 独立厨房 | 现代卫浴 | 停车位",
  "Brand new-Modern spacious 1/BHK | Sep.kitchen | Modern bath | Parking": "全新现代宽敞一室一厅 | 独立厨房 | 现代卫浴 | 停车位",
  "Brand new|High finishing|1BHK|Private entrance|Covered parking|Modern|Ready to move|Separate kitchen and bathroom": "全新精装 | 一室一厅 | 独立入口 | 室内停车 | 现代风格 | 拎包入住 | 独立厨卫",
  "Bright & Spacious One Bedroom Hall Apartment": "明亮宽敞的一室一厅公寓",
  "Charming 1 BR Apartment in Khalifa City A": "Khalifa City A 迷人一居室公寓",
  "Charming 1BHK | No Commission | Free Water And Electricity": "迷人一室一厅 | 免中介费 | 水电全包",
  "Cozy Unit in a Vibrant Residential Hub": "繁华居住区内的温馨单位",
  "Deluxe 1 BHK W/ 0% Commission Free ADDC | Hot Deal": "豪华一室一厅 | 零中介费 水电全包 | 特惠房源",
  "Deluxe 1BHK W/Balcony | Free ADDC | 0% Commission": "豪华一室一厅带阳台 | 水电全包 | 零中介费",
  "Deluxe 1BHK | Free ADDC | NO COMMISSION | Just Listed": "豪华一室一厅 | 水电全包 | 免中介费 | 最新挂牌",
  "Duplex-1-BHK|Pvt Backyard|Share Pool|GYM|Huge Room": "复式一室一厅 | 私家后院 | 共享泳池 | 健身房 | 超大房间",
  "EUROPEAN STYLE 1BHK WITH HUGE KITCHEN AND WASHROOM": "欧式一室一厅 带超大厨卫",
  "EXCLUSIVE 1BHK AVAILABLE IN MBZ ZONE 6 BEHINDBURJEEL,MAZYAD MALL /(MONTHLYRENT 4500) (ASIANS ONLY)": "MBZ Zone 6 独家一室一厅 Mazyad Mall 后面 (月租 4500) (仅限亚洲人)",
  "Elegant & Spacious 1BHK for Rent in Al Rahba – Prime Location": "Al Rahba 黄金地段 优雅宽敞一室一厅出租",
  "Elegant 1 Bedroom Tawtheeq Available 0 Commission Free Bills": "优雅一居室 有租赁合同 免中介费 租金含水电",
  "Elegant And Spacious 1BHK With Separate Kitchen, Nice Washroom And Big Window In Khalifa City A": "Khalifa City A 优雅宽敞一室一厅 独立厨房 漂亮洗手间 大窗户",
  "Elegant Living | Amazing View | Unfurnished": "优雅生活 | 迷人景观 | 无家具",
  "European Community Pvt/Entrance Royal Finishing 1BHK Separate Kitchen Proper Bathtub Washroom In KCA": "KCA 欧洲社区 独立入口 皇家精装 一室一厅 独立厨房 浴缸卫浴",
  "European Compound Luxury 1Bedroom+Kitchen+Bath +Free WIFI 4800-monthly": "欧洲社区豪华一居室+厨房+卫浴+免费WiFi 月租4800",
  "European Luxury 1BHK+Backyard+Free WIFI+4700-Month": "欧式豪华一室一厅+后院+免费WiFi 月租4700",
  "European Villa 1Bedroom + Separate Kitchen+ Bath": "欧式别墅一居室 + 独立厨房 + 卫浴",
  "Excellent Sunny 1 Bedroom Hall With Separate Kitchen Big Windows Spacious Bath Tub In KCA": "KCA 采光极佳一室一厅 独立厨房 大窗户 宽敞浴缸",
  "Exclusive | Brand new 1/BHK | Sep. kitchen | modern bath | Ready to move | Parking": "独家 | 全新一室一厅 | 独立厨房 | 现代卫浴 | 拎包入住 | 停车位",
  "Exclusive | Brand new 1/BHK | Sep.kitchen | modern bath | Ready to move | Parking": "独家 | 全新一室一厅 | 独立厨房 | 现代卫浴 | 拎包入住 | 停车位",
  "Family Community 1 BR, Separate kitchen, Wardrobes": "家庭社区一居室 独立厨房 带衣柜",
  "Family Community 1bhk Separate Kitchen Proper Washroom Near Market In KCA": "KCA 家庭社区一室一厅 独立厨房 独立洗手间 靠近市场",
  "Family Community 1bhk Separate Kitchen Proper Washroom Near Safeer Mall In KCA": "KCA 家庭社区一室一厅 独立厨房 独立洗手间 靠近 Safeer Mall",
  "Family Community Luxury 1 Bedroom Separate Kitchen Full Washroom In KCA": "KCA 家庭社区豪华一居室 独立厨房 完整洗手间",
  "Family Compound 1Bhk Separate Kitchen Big Rooms Size Well Finishing On Prime Location In KCA": "KCA 黄金地段 家庭社区一室一厅 独立厨房 房间宽敞 精装修",
  "Fully Furnished New Studio Apartment with Parking Al Bateen (Monthly : 4500)": "Al Bateen 全新全家具开间公寓带车位 (月租 4500)",
  "Fully Furnished | Mangrove View | High Floor": "全家具 | 红树林景观 | 高楼层",
  "Fully Furnished | Studio | Ready to move in": "全家具 | 开间 | 拎包入住",
  "Furnished Studio Apartment in Al Reem / 7.5k M": "Al Reem 全家具开间公寓 / 月租 7500",
  "GET THE DEAL◆AMAZING LOCATION◆MOVE NOW◆HOT PRICE": "抓紧机会◆黄金地段◆即刻入住◆劲爆价格",
  "High Floor|1BHK|Pvt Balcony|Share Pool|Unit Tawthe": "高楼层|一室一厅|私家阳台|共享泳池|正规合同",
  "Hot Deal  | Ready to Move In | With Balcony": "特惠房源 | 拎包入住 | 带阳台",
  "Hot Deal 1BR Prime Layout in Wifaq Tower!": "超值优惠！Wifaq Tower 优质户型一居室",
  "Hot Deal! 1BR Apartment for RENT just 75K.": "特惠！一居室公寓出租，仅需7.5万",
  "Hot Offer | 1 Bedroom Apt | Facilities | Parking": "热门房源 | 一居室公寓 | 设施齐全 | 带车位",
  "Huge Size One BHK With Private Roof Near Mazyed Mall MBZ": "超大面积一居室，带私家天台，近 MBZ Mazyed Mall",
  "LUXURIOUS 1 BEDROOM APARTMENT IN MBZ CITY": "MBZ City 豪华一居室公寓",
  "LUXURY 1BHK !! SHARED POOL !! SEP KITCHEN !! PROPER WASHROOM !! KCA": "豪华一居室！公用泳池！独立厨房！标准卫浴！KCA",
  "Limited offer |1 bedroom Apt | Facilities | Parking": "限时优惠 | 一居室公寓 | 设施齐全 | 带车位",
  "Limited-Time Offer | Beautifully Designed | Utilities Free | Great Location | Book Today": "限时特惠 | 精美设计 | 包水电 | 地段优越 | 立即预订",
  "Loft 1BR Layout | Balcony | Ready to move in soon": "复式一居室 | 带阳台 | 即将入住",
  "Lowest Price | Perfectly Located | Book Now": "最低价 | 黄金地段 | 立即预订",
  "Luxurious 01:Bedroom Hall": "豪华一室一厅",
  "Luxury 1-bed Flat available for rent in Baniyas": "Baniyas 豪华一居室公寓出租",
  "Luxury Studio with Amazing View | Available | Flexible Payment": "豪华单身公寓，景观极佳 | 现房 | 付款方式灵活",
  "Luxury|1 BHK|Sep Kitchen H uge Room Big Sunlight Window And Private Garden On Prime Location In KCA": "豪华一居室 | 独立厨房 | 超大房间 | 采光充足 | 带私家花园 | KCA 黄金地段",
  "Modern 1BHK W/Balcony  | No Commission": "现代一居室带阳台 | 免中介费",
  "Modern 1BHK | Free ADDC | 0% Commission  Hot Deal": "现代一居室 | 包水电 (ADDC) | 免中介费 | 超值优惠",
  "Modern Living | Lower Level | Vacant": "现代生活 | 低楼层 | 空置",
  "NO COMMISSION+ONE MONTH FREE  1 BR  2 Bath in Al reem island - sea face tower": "免中介费 + 免租一个月 | 一室两卫 | Reem 岛海景塔",
  "New 01 Bedroom Hall Apartment for Family | Al Rahba": "Al Rahba 全新一室一厅家庭公寓",
  "Newly Renovated One Bedroom | No Commission | Free ADDC": "全新装修一居室 | 免中介费 | 包水电",
  "No Commission Elegant 1BHK Spacious & Affordable": "免中介费 | 优雅一居室 | 宽敞实惠",
  "ONE BEDROOM HALL BRAND NEW MONTHLY BASIS RENT 4500 AED": "全新一室一厅，月租 4500 迪拉姆",
  "PRIME LOCATION 1BHK APARTMENT WITH ALL FACILITIES": "黄金地段一居室，设施齐全",
  "PRIVATE ENTRANCE! Fully Furnished 1-Bedroom With Water & Electricity Included": "独立出入！精装一居室，包水电",
  "PRIVATE ENTRANCE! Fully Furnished Studio Apartment With Water & Electricity Included": "独立出入！精装单身公寓，包水电",
  "Precious 1BR with Balcony | Type D | Available Soon": "优质一居室带阳台 | D 型户型 | 即将起租",
  "Prime Location/ Ready To Move/ Tawtheeq Available/ No Commission": "黄金地段 / 即刻入住 / 可办 Tawtheeq / 免中介费",
  "Private Balcony Brand New Luxurious One Bedroom Hall Separate Kitchen Proper Bathtub Washroom Near By Safeer Mall In Khalifa City A": "私家阳台 | 全新豪华一室一厅 | 独立厨房 | 带浴缸卫浴 | 近 KCA Safeer Mall",
  "Private Entrance Brand new flat in Shakhbout City": "独立出入 | Shakhbout City 全新公寓",
  "READY TO MOVE IN • FLEXIBLE PAYMENTS • BEST OFFER!!": "即刻入住 • 付款灵活 • 最佳优惠！！",
  "RTM II Prime Location II 0% Commission II Tawtheeq Available": "即刻入住 | 黄金地段 | 免中介费 | 可办 Tawtheeq",
  "Ready To Move | Fully Furnished | Huge & Bright": "即刻入住 | 全家具精装 | 宽敞明亮",
  "Ready to Move | Fully Furnished | Flexible Payment": "即刻入住 | 全家具精装 | 付款灵活",
  "Spacious 1 BHK Apartment with Utilities included": "宽敞一居室公寓，包水电",
  "Spacious 1 Bedroom Apartment for Rent in Musaffah Shabiya 10 With Balcony": "Musaffah Shabiya 10 宽敞一居室，带阳台，出租",
  "Spacious 1 Bedroom Apt | Facilities | Parking": "宽敞一居室 | 设施齐全 | 带车位",
  "Spacious 1BHK Apartment for Rent | Water & Electricity Included | Al Khalidiyah (Near Khalidiyah Mall)": "Al Khalidiyah 宽敞一居室出租 | 包水电 | 近 Khalidiyah Mall",
  "Spacious 1BHK Apartment for Rent | Water & Electricity Included | Al Khalidiyah ,Near International Community School": "Al Khalidiyah 宽敞一居室出租 | 包水电 | 近国际社区学校",
  "Spacious 1BHK Chiller Free with 2 Washrooms | 2BHK": "宽敞一居室，免空调费，双卫",
  "Spacious 1BHK With Separate Kitchen Excellent Rooms Size Proper Washroom Khalifa City a": "KCA 宽敞一居室，带独立厨房，房间大，标准卫浴",
  "Spacious 1BR | Balcony | Up to 4 Payments | Hot Deal": "宽敞一居室 | 带阳台 | 最多可分4期付款 | 超值优惠",
  "Spacious One bedroom hall in Al Shahama Abudhabi": "阿布扎比 Al Shahama 宽敞一室一厅",
  "Spacious One-Bedroom /Tawtheeq Available/Free Bill": "宽敞一居室 / 可办 Tawtheeq / 包水电",
  "Spacious Studio | Mangrove View | Ready to Move": "宽敞单身公寓 | 红树林景观 | 即刻入住",
  "Specious 1 Bedroom Apartment for Families Near to Mushrif Mall": "近 Mushrif Mall 宽敞一居室家庭公寓",
  "Spectacular 1 Bedroom 0 Commission 0 Bills Tawtheeq Available": "绝佳一居室 | 免中介费 | 包水电 | 可办 Tawtheeq",
  "Studio Brand New Villa Paint House Balcony Near Mushrif Mall Abu Dhabi": "近 Mushrif Mall 全新别墅单间，带阳台，阿布扎比",
  "Stylish 1BR | Available from MARCH 12 | Book Now": "时尚一居室 | 3月12日起租 | 立即预订",
  "Super Clean Furnished Studio with Separate entrance": "超整洁精装单身公寓，独立出入",
  "Superb Fully Furnished Suite In Alreem, City View, / 5800 Monthly": "Reem 岛极佳精装套房，城景，月租 5800",
  "Todays' offer -18 Feb - Big Size- Ready to move": "今日特惠 (2月18日) - 大户型 - 即刻入住",
  "Tremendous 1BHK With Closed Kitchen & Spacious Saloon": "超大一居室，带独立厨房和宽敞客厅",
  "Type C | Relaxation Mode on | Spacious Unit |": "C 型户型 | 舒适休闲 | 空间宽敞",
  "UPCOMING!! 1 BHK | GYM & POOL | JACUZZI | SAUNA | STEAM ROOM | TOP NOTCH FACILITIES | CALL US NOW!": "即将推出！！一居室 | 健身房与泳池 | 按摩浴缸 | 桑拿房 | 蒸汽室 | 顶尖设施 | 立即咨询！",
  "Unfurnished 1 Bedroom Apartment With Parking & Water And Electricity Included": "简装一居室公寓，带车位，包水电",
  "Up-Coming Studio | Brand New I Handover March 2026": "即将推出单身公寓 | 全新 | 2026年3月交付",
  "Upcoming One-Bedroom II Prime Location II 0% Commission II Tawtheeq Available": "即将推出一居室 | 黄金地段 | 免中介费 | 可办 Tawtheeq",
  "VACANT ON MARCH END 1PAY 1BR APT TYPE D BOOK NOW": "3月底空置 | 一次性付清 | D 型一居室 | 立即预订",
  "VACANT | Urban View | Upto 4 Payments | High Floor": "空置 | 城景 | 最多4期付款 | 高楼层",
  "Vacant / Ready to move / Balcony": "空置 / 即刻入住 / 带阳台",
  "Vacant / Ready to move / Spacious": "空置 / 即刻入住 / 空间宽敞",
  "Vacant soon / Mangrove view / Great Facilities": "即将空置 / 红树林景观 / 设施完善",
  "Vibrant | Furnished Studio | Sea View | Vacant": "活力社区 | 精装单身公寓 | 海景 | 空置",
  "Well Maintained | Move In Ready | Low Floor": "保养良好 | 即刻入住 | 低楼层",
  "Well-Planned 1-Bedroom Home in a Self-Sufficient Community": "配套完善社区内规划精良的一居室住宅",
  "luxury|Furnished1BHK|Sep Kitchen|Monthly 5700/|KCA": "豪华 | 精装一居室 | 独立厨房 | 月租 5700 | KCA",
  "⇛ Prime Area ⇛ Spacious Unit ⇛ Ready To Move ⇚": "⇛ 核心地段 ⇛ 宽敞单位 ⇛ 即刻入住 ⇚"
};

async function applyTranslations() {
  const client = new MongoClient(config.mongo.uri);
  try {
    await client.connect();
    const db = client.db(config.mongo.dbName);
    const col = db.collection('targeted_results');

    let updated = 0;
    let notFound = 0;
    for (const [title, zh] of Object.entries(translations)) {
      const result = await col.updateMany(
        { title },
        { $set: { title_zh: zh } }
      );
      if (result.modifiedCount > 0) {
        updated += result.modifiedCount;
      } else {
        notFound++;
      }
    }
    console.log(`Updated ${updated} documents across ${Object.keys(translations).length} unique titles (${notFound} titles had no matches)`);

    // Verify
    const total = await col.countDocuments();
    const withZh = await col.countDocuments({ title_zh: { $exists: true, $ne: null } });
    console.log(`Verification: ${withZh}/${total} documents now have title_zh`);
  } finally {
    await client.close();
  }
}

applyTranslations();
