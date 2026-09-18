'use strict';
/* ============================================================================
   WT 研发点计算器(wtrp)
   科技树渲染核心 = WT-Tech-Tree-Maker(przemyslaw-zan,MIT)原样保留:
     classIcons / organizeTree / isFollowApplied / drawTree / romanize /
     affixFolderNumbers / createBranchArrows / setFillerSizes / addBranchHeaders /
     fitOverflowingFolder / createVehicleBadge / createFolder / isFolderRoot /
     isInFolder / createSvg
   本站改动(文件头与页脚均有披露):
     - 移除全部编辑器(CKEditor/galleria/jQuery/select2)与 localStorage 编辑态
     - 数据改为管线加载:data/c_<country>.json(shop.blkx 列序 + /wtapi/ 经济字段)
     - 界面与等级/纵队文案中文化
     - 载具卡点击 = 详情弹窗(statcard 图 + 经济数据)+ 已拥有/研发目标(多选)
     - 计算层:多目标前置闭包并集 → 剩余RP/银狮/金鹰 + 场次/时长/金鹰换算
   上游源码: https://github.com/przemyslaw-zan/WT-Tech-Tree-Maker
   ========================================================================== */

const COUNTRIES = [
	['usa', '美国'], ['germany', '德国'], ['ussr', '苏联'], ['britain', '英国'], ['japan', '日本'],
	['china', '中国'], ['france', '法国'], ['italy', '意大利'], ['sweden', '瑞典'], ['israel', '以色列'],
];
const BRANCHES = [['ground', '陆战'], ['aviation', '空战'], ['helicopters', '直升机'],
	['naval_blue', '蓝水海军'], ['naval_coastal', '海岸海军']];
const TYPE_ZH = { researchable: '科技树', premium: '高级', pack: '礼包', market: '市场', squadron: '中队', event: '活动' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

const S = {
	country: localStorage.getItem('wtrp2.country') || 'usa',
	branch: localStorage.getItem('wtrp2.branch') || 'ground',
	cache: {},            // country -> branches 数据
	entries: [],          // 当前分支条目
	byId: {},
	prevInCol: {},        // id -> 列内前一辆(required_vehicle 为空时的前置)
	owned: new Set(JSON.parse(localStorage.getItem('wtrp2.owned') || '[]')),
	targets: new Set(JSON.parse(localStorage.getItem('wtrp2.targets') || '[]')),
	effRP: +(localStorage.getItem('wtrp2.effRP') || 8000),
	mins: +(localStorage.getItem('wtrp2.mins') || 8),
	version: '',
};
const settings = { menuVisible: false, screenshotMode: false, thumbnailStyle: '0', badgeStyle: '0' };
const $ = sel => document.querySelector(sel);
const fmt = n => n >= 1e8 ? (n / 1e8).toFixed(2) + ' 亿' : n >= 1e4 ? (n / 1e4).toFixed(n % 1e4 ? 1 : 0) + ' 万' : String(Math.round(n || 0));

/* ===================== TTM 核心区(verbatim,仅注明改动) ===================== */

const classIcons = [
	{ id: 'none', name: 'None', shapes: [
		{ type: 'line', 'stroke-width': '2', y2: '14', x2: '17', y1: '1', x1: '4', stroke: '#ff0000' },
		{ type: 'line', 'stroke-width': '2', y2: '14', x2: '4', y1: '1', x1: '17', stroke: '#ff0000' }
	] },
	{ id: 'lt', name: 'Light Tank', shapes: [ { type: 'rect', height: '9', width: '21', y: '3', x: '0', fill: '#ffeeee' } ] },
	{ id: 'mt', name: 'Medium Tank', shapes: [
		{ type: 'rect', height: '9', width: '21', y: '3', x: '0', fill: '#ffaaaa' },
		{ type: 'rect', height: '4', width: '6', y: '11', x: '0', fill: '#ffaaaa' },
		{ type: 'rect', height: '4', width: '6', y: '11', x: '15', fill: '#ffaaaa' }
	] },
	{ id: 'ht', name: 'Heavy Tank', shapes: [
		{ type: 'rect', height: '9', width: '21', y: '3', x: '0', fill: '#ff6666' },
		{ type: 'rect', height: '4', width: '6', y: '11', x: '0', fill: '#ff6666' },
		{ type: 'rect', height: '4', width: '6', y: '11', x: '15', fill: '#ff6666' },
		{ type: 'rect', height: '4', width: '7', y: '0', x: '7', fill: '#ff6666' }
	] },
	{ id: 'td', name: 'Tank Destroyer', shapes: [
		{ type: 'rect', height: '5', width: '21', y: '10', x: '0', fill: '#bde9b5' },
		{ type: 'line', y2: '10', x2: '0', y1: '0', x1: '21', 'stroke-width': '3', stroke: '#bde9b5' }
	] },
	{ id: 'spaa', name: 'Self Propelled Anti-Air', shapes: [
		{ type: 'rect', height: '5', width: '21', y: '10', x: '0', fill: '#c6a0ff' },
		{ type: 'rect', height: '11', width: '4', y: '0', x: '4', fill: '#c6a0ff' },
		{ type: 'rect', height: '11', width: '4', y: '0', x: '13', fill: '#c6a0ff' }
	] },
	{ id: 'fighter', name: 'Fighter', shapes: [ { type: 'path', d: 'm0,7.5l10.5,-7.5l10.5,7.5l-10.5,7.5l-10.5,-7.5z', fill: '#ffac6f' } ] },
	{ id: 'attacker', name: 'Attacker', shapes: [ { type: 'path', d: 'm0,7.5l10.5,-5l10.5,5l-10.5,5l-10.5,-5z', fill: '#bde9b5' } ] },
	{ id: 'bomber', name: 'Bomber', shapes: [
		{ type: 'rect', height: '7.5', width: '21', y: '0', x: '0', fill: '#a3b1ff' },
		{ type: 'path', d: 'm0,7.5l10.5,-7.5l10.5,7.5l-10.5,7.5l-10.5,-7.5z', fill: '#a3b1ff' }
	] },
	{ id: 'ahel', name: 'Attack Helicopter', shapes: [ { type: 'path', d: 'm0,7.5l10.5,-5l10.5,5l-10.5,5l-10.5,-5z', fill: '#f2f266' } ] },
	{ id: 'uhel', name: 'Utility Helicopter', shapes: [
		{ type: 'rect', height: '7.5', width: '21', y: '0', x: '0', fill: '#9bf266' },
		{ type: 'path', d: 'm0,7.5l10.5,-7.5l10.5,7.5l-10.5,7.5l-10.5,-7.5z', fill: '#9bf266' }
	] },
	{ id: 'tboat', name: 'Torpedo Boat', shapes: [ { type: 'path', 'stroke-width': '2', d: 'M20 1L.75 7 20 13z', stroke: '#01d1de', fill: 'none' } ] },
	{ id: 'gboat', name: 'Gun Boat', shapes: [ { type: 'path', 'stroke-width': '2', d: 'M20 1L.75 7 20 13z', stroke: '#a3b1ff', fill: '#a3b1ff' } ] },
	{ id: 'barge', name: 'Barge', shapes: [ { type: 'path', 'stroke-width': '2', d: 'M1 1h19v12H1z', stroke: '#f8cdae', fill: 'none' } ] },
	{ id: 'dd', name: 'Frigate / Destroyer', shapes: [ { type: 'path', 'stroke-width': '2', d: 'M20 1H7L.75 7 7 13h13z', stroke: '#f8a86d', fill: 'none' } ] },
	{ id: 'cl', name: 'Light Cruiser', shapes: [
		{ type: 'path', 'stroke-width': '2', d: 'M20 1H7L.75 7 7 13h13z', stroke: '#f8a6a6', fill: 'none' },
		{ type: 'path', 'stroke-width': '2', d: 'M15.75 1v12', stroke: '#f8a6a6' }
	] },
	{ id: 'ca', name: 'Heavy Cruiser', shapes: [
		{ type: 'path', 'stroke-width': '2', d: 'M20 1H7L.75 7 7 13h13z', stroke: '#ffaaaa', fill: 'none' },
		{ type: 'path', 'stroke-width': '2', d: 'M16 1H20v12h-4z', stroke: '#ffaaaa', fill: '#ffaaaa' }
	] },
	{ id: 'cc', name: 'Battlecruiser', shapes: [
		{ type: 'path', 'stroke-width': '2', d: 'M20 1H7L.75 7 7 13h13z', stroke: '#fda9a9', fill: 'none' },
		{ type: 'path', 'stroke-width': '2', d: 'M18 1H20v12h-2z', stroke: '#fda9a9', fill: '#ffaaaa' },
		{ type: 'path', 'stroke-width': '2', d: 'M11 1H13v12h-2z', stroke: '#fda9a9', fill: '#ffaaaa' }
	] },
	{ id: 'bb', name: 'Battleship', shapes: [
		{ type: 'path', 'stroke-width': '2', d: 'M20 1H7L.75 7 7 13h13z', stroke: '#fd6565', fill: 'none' },
		{ type: 'path', 'stroke-width': '2', d: 'M16 1v12', stroke: '#fd6565' },
		{ type: 'path', 'stroke-width': '2', d: 'M12 1v12', stroke: '#fd6565' },
		{ type: 'path', 'stroke-width': '2', d: 'M8 1v12', stroke: '#fd6565' }
	] }
];
let sortingLoopError = false;

function organizeTree ( vehicleList ) {
	sortingLoopError = false;
	const sortedVehicles = {};
	for ( const vehicle of vehicleList ) {
		const branchName = ![ 'researchable', 'reserve' ].includes( vehicle.type ) ? `premium_${ vehicle.branch }` : vehicle.branch;
		const vehicleRegion = `rank_${ vehicle.rank }_branch_${ branchName }`;
		if ( sortedVehicles[ vehicleRegion ] === undefined ) sortedVehicles[ vehicleRegion ] = [];
		sortedVehicles[ vehicleRegion ].push( vehicle );
	}
	for ( const region in sortedVehicles ) {
		let array = sortedVehicles[ region ];
		array.sort( ( a, b ) => a.br - b.br );
		const followers = array.filter( ( item ) => {
			return ![ undefined, 'undefined' ].includes( item.follow );
		} );
		if ( followers.length > 0 ) {
			let i = 0;
			while ( !isFollowApplied( array ) ) {
				for ( const follower of followers ) {
					if (
						array.findIndex( ( item ) => {
							return item.id === follower.follow;
						} ) === -1
					)
						continue;
					array.splice( array.indexOf( follower ), 1 );
					const target =
							array.findIndex( ( item ) => {
								return item.id === follower.follow;
							} ) + 1;
					array.splice( target, 0, follower );
				}
				i++;
				if ( i > 1000 ) {
					console.log( 'infinite loop detected' );
					sortingLoopError = true;
					break;
				}
			}
		}

		const temp = [ ...array ];
		array = [];
		for ( const vehicle of temp ) {
			if ( array.length === 0 ) {
				array.push( vehicle );
				continue;
			}
			if ( vehicle.connection === 'folder' ) {
				if ( array[ array.length - 1 ].constructor === Array ) {
					array[ array.length - 1 ].push( vehicle );
					continue;
				}
				const popped = array.pop();
				array.push( [ popped, vehicle ] );
				continue;
			}
			array.push( vehicle );
		}
		sortedVehicles[ region ] = array;
	}
	return sortedVehicles;
}
function isFollowApplied ( array ) {
	array = [ ...array ];
	const allIds = array.map( vehicle => vehicle.id );
	const allFollows = array.map( vehicle => vehicle.follow ).filter( id => ![ undefined, 'undefined' ].includes( id ) );
	const invalidFollows = allFollows.filter( id => !allIds.includes( id ) );
	if ( ![ undefined, 'undefined' ].includes( array[ 0 ].follow ) ) {
		if (
			array.some( ( vehicle ) => {
				return vehicle.id === array[ 0 ].follow;
			} )
		)
			return false;
	}
	while ( array.length >= 2 ) {
		if ( ![ undefined, 'undefined' ].includes( array[ 1 ].follow ) ) {
			if ( array[ 0 ].id !== array[ 1 ].follow && !invalidFollows.includes( array[ 1 ].follow ) ) return false;
		}
		array.shift();
	}
	return true;
}
function drawTree ( organizedVehicles ) {
	const tbody = document.querySelector( '#techTree' );
	tbody.innerHTML = '';
	const ranks = [];
	const branches = [];
	for ( const region in organizedVehicles ) {
		const rank = Number( region.match( /_(\d+)_/ )[ 1 ] );
		if ( !ranks.includes( rank ) ) ranks.push( rank );
		const branch = region.match( /(?<=branch_).+$/gm )[ 0 ];
		if ( !branches.includes( branch ) ) branches.push( branch );
	}
	const topRank = Math.max( ...ranks );
	const bottomRank = Math.min( ...ranks );
	for ( let i = bottomRank; i < topRank; i++ ) {
		if ( !ranks.includes( i ) ) {
			ranks.push( i );
		}
	}
	ranks.sort( ( a, b ) => Number( a ) - Number( b ) );
	branches.sort();
	const techTree = document.querySelector( '#techTree' );
	techTree.innerHTML = '';
	for ( const rank of ranks ) {
		let firstPremiumBranch = true;
		const rankDiv = document.createElement( 'div' );
		rankDiv.classList.add( 'rank' );
		const rankNumDiv = document.createElement( 'div' );
		rankNumDiv.classList.add( 'rankNumber' );
		const rankNumDivText = document.createElement( 'div' );
		rankNumDivText.innerHTML = `等级 <b>${ romanize( rank ) }</b>`; /* wtrp: Rank→等级 */
		rankNumDivText.classList.add( 'rankNumberText' );
		rankNumDiv.appendChild( rankNumDivText );
		rankDiv.appendChild( rankNumDiv );
		for ( const branch of branches ) {
			const branchDiv = document.createElement( 'div' );
			branchDiv.classList.add( 'branch' );
			if ( branch.indexOf( 'premium' ) !== -1 && firstPremiumBranch ) {
				firstPremiumBranch = false;
				branchDiv.style.borderLeft = '2px solid white';
			}
			const region = `rank_${ rank }_branch_${ branch }`;
			if ( organizedVehicles[ region ] !== undefined ) {
				for ( const vehicle of organizedVehicles[ region ] ) {
					if ( vehicle.constructor === Array ) {
						branchDiv.appendChild( createFolder( vehicle ) );
					} else {
						branchDiv.appendChild( createVehicleBadge( vehicle ) );
					}
				}
			}
			const filler = document.createElement( 'div' );
			filler.classList.add( 'fillerDiv' );
			filler.classList.add( `badgeLine_${ branch }` );
			branchDiv.appendChild( filler );
			rankDiv.appendChild( branchDiv );
		}
		techTree.appendChild( rankDiv );
	}

	affixFolderNumbers();
	createBranchArrows();
	setFillerSizes();
	addBranchHeaders();
	fitOverflowingFolder();
}
function romanize ( num ) {
	if ( num === 0 ) {
		return '0';
	}
	var lookup = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 },
		roman = '', i;
	for ( i in lookup ) {
		while ( num >= lookup[ i ] ) {
			roman += i;
			num -= lookup[ i ];
		}
	}
	return roman;
}
function affixFolderNumbers () {
	const toAffix = document.querySelectorAll( '.folderNumber' );
	toAffix.forEach( ( item ) => {
		const notch = document.createElement( 'div' );
		notch.innerText = `+${ item.innerText - 1 }`;
		notch.classList.add( 'folderNumber' );
		item.parentNode.querySelector( '.vehicleBadge' ).appendChild( notch );
		item.remove();
	} );
}
function createBranchArrows () {
	const branchLines = [];
	document.querySelectorAll( '.vehicleBadge' ).forEach( vehicleBadge => {
		const badgeLine_ = [ ...vehicleBadge.classList ].find( cls => cls.startsWith( 'badgeLine_' ) );
		if ( !branchLines.includes( badgeLine_ ) ) {
			branchLines.push( badgeLine_ );
		}
	} );

	for ( const line of branchLines ) {
		const nodes = [ ...document.querySelectorAll( `.${ line }` ) ]
			.filter( node => !isInFolder( node ) );

		const indexesOfVehicles = [];
		nodes.forEach( ( node, index ) => {
			if ( node.classList.contains( 'vehicleBadge' ) ) {
				indexesOfVehicles.push( index );
			}
		} );

		if ( indexesOfVehicles.length < 2 ) {
			continue;
		}

		const firstVehicle = indexesOfVehicles.shift();
		const lastVehicle = indexesOfVehicles.pop();

		const trimmedLine = nodes.slice( firstVehicle + 1, lastVehicle + 1 );

		const gapsToFill = [];
		let tmpArr = [];

		trimmedLine.forEach( node => {
			const isVehicle = node.classList.contains( 'vehicleBadge' );
			if ( !isVehicle ) {
				tmpArr.push( node );
			} else {
				if ( node.classList.contains( 'connected_yes' ) ) {
					gapsToFill.push( tmpArr );
				}
				tmpArr = [];
			}
		} );

		for ( const gap of gapsToFill ) {
			while ( gap.length > 1 ) {
				gap.shift().innerHTML += '<div class="lineDiv"></div>';
			}
			gap[ 0 ].innerHTML += '<div class="lineArrow"></div>';
		}
	}

	[ ...document.querySelectorAll( '.folderTooltipText' ) ].forEach( folder => {
		const folderLines = [ ...folder.querySelectorAll( '.badgeLine' ) ];
		for ( let i = 1; i < folderLines.length - 1; i++ ) {
			if ( i % 2 === 0 ) {
				folderLines[ i ].innerHTML += '<div class="lineArrow"></div>';
			} else {
				folderLines[ i ].innerHTML += '<div class="lineDiv"></div>';
			}
		}
	} );
}
function setFillerSizes () {
	const fillers = document.querySelectorAll( '.fillerDiv' );
	fillers.forEach( ( div ) => {
		const y1 = div.getBoundingClientRect().y;
		const y2 = div.parentNode.getBoundingClientRect().y + div.parentNode.getBoundingClientRect().height;
		div.style.height = `${ y2 - y1 }px`;
	} );
}
function addBranchHeaders () {
	[ ...document.querySelectorAll( '.rank:first-child .branch' ) ].forEach( branch => {
		const branchName = [ ...branch.querySelectorAll( 'div' ) ]
			.map( child => {
				return [ ...child.classList ].find( cls => {
					return /badgeLine_/.test( cls );
				} );
			} )
			.find( Boolean )
			.split( '_' )
			.slice( 1 )
			.join( ' ' );

		const bold = document.createElement( 'b' );
		bold.style.display = 'block';
		bold.style.textAlign = 'center';
		bold.style.padding = '10px';
		/* wtrp: 纵队头(原为可编辑 Branch 输入框) */
		const n = branchName.replace( /[^0-9]/g, '' );
		bold.innerText = branchName.includes( 'premium' ) ? '' : `纵队 ${ n || '' }`;
		bold.classList.add( 'branchHeaderBold' );

		const div = document.createElement( 'div' );
		div.style.height = '21px';
		div.classList.add( 'branchHeaderClear' );
		branch.prepend( div );
		branch.prepend( bold );
	} );
}
function fitOverflowingFolder () {
	const lowestTreePoint = document.querySelector( '#techTree' ).getBoundingClientRect().bottom;
	const lowestFolderPoint = Math.max( ...[ ...document.querySelectorAll( '.folderTooltipText' ) ].map( node => {
		return node.getBoundingClientRect().bottom;
	} ) );
	const difference = lowestFolderPoint - lowestTreePoint;
	if ( difference > 0 ) {
		const lastRank = [ ...document.querySelectorAll( '.rank' ) ].pop();
		const currentHeight = lastRank.getBoundingClientRect().height;
		lastRank.style.height = `${ currentHeight + difference }px`;
	}
}
function createVehicleBadge ( vehicle ) {
	const div = document.createElement( 'div' );
	div.dataset.vid = vehicle.id; /* wtrp: 委托点击用 */
	let img = '';
	const imgStyle = { 0: 'max-height: 70%; max-width: 80%', 1: 'max-height: 100%; max-width: 100%', 2: 'height: 100%; width: 100%' }[ settings.thumbnailStyle ];
	if ( vehicle.thumbnail !== undefined ) img = `<img loading="lazy" src="${ vehicle.thumbnail }" style="${ imgStyle }" onerror="this.style.display='none'">`;
	let svg = '';
	if ( vehicle.classIcon && vehicle.classIcon !== 'none' ) {
		svg = createSvg( classIcons.find( classIcon => classIcon.id === vehicle.classIcon ) );
	}
	let brLabel = '';
	if ( vehicle.type === 'reserve' ) brLabel = `<i>Reserve</i> (${ vehicle.br.toFixed( 1 ) })`;
	else brLabel = vehicle.br.toFixed( 1 );
	let branchLine = '';
	if ( [ 'researchable', 'reserve' ].includes( vehicle.type ) ) branchLine = `badgeLine_${ vehicle.branch }`;
	else branchLine = `badgeLine_premium_${ vehicle.branch }`;
	div.innerHTML = `<table>
<tbody>
<tr>
<td rowspan="3" class="badgeSide"></td>
<td class="badgeLine ${ branchLine }"></td>
<td rowspan="3" class="badgeSide"></td>
</tr>
<tr>
<td id="${ vehicle.id }"
class="vehicleBadge type_${ vehicle.type } ${ branchLine }
connected_${ vehicle.connection }"
style="position:relative; cursor:pointer;"
title="${ vehicle.id }">
<span class="vehicleName">${ vehicle.name }</span>
<b class="vehicleBr">${ brLabel }</b>
${ img }
${ svg }
</td>
</tr>
<tr>
<td class="badgeLine ${ branchLine }"></td>
</tr>
</tbody>
</table>`;
	return div;
}
function createFolder ( folder ) {
	const folderDiv = document.createElement( 'div' );
	const tooltipText = document.createElement( 'span' );
	const carpet = document.createElement( 'div' );
	carpet.classList.add( 'carpet' );
	tooltipText.appendChild( carpet );
	folderDiv.appendChild( createVehicleBadge( folder[ 0 ] ) );
	folderDiv.classList.add( 'folderTooltip' );
	tooltipText.classList.add( 'folderTooltipText' );
	for ( const vehicle of folder ) {
		tooltipText.appendChild( createVehicleBadge( vehicle ) );
	}
	folderDiv.innerHTML += `<div class="folderNumber">${ folder.length }</div>`;
	folderDiv.appendChild( tooltipText );
	return folderDiv;
}
function isFolderRoot ( node ) {
	const initialNode = node;
	const nodesWithId = [];
	while ( !node.classList.contains( 'folderTooltip' ) ) {
		node = node.parentNode;
		if ( node.classList.contains( 'branch' ) ) {
			return false;
		}
	}
	const output = node.querySelector( '.folderTooltipText' );
	for ( const childNode of node.querySelectorAll( '*' ) ) {
		if ( childNode.id ) nodesWithId.push( childNode );
	}
	if ( initialNode.isSameNode( nodesWithId[ 0 ] ) ) {
		return output;
	}
	return false;
}
function isInFolder ( node ) {
	while ( node.id !== 'techTree' ) {
		if ( node.classList.contains( 'folderTooltipText' ) ) return true;
		node = node.parentNode;
	}
	return false;
}
function createSvg ( icon ) {
	const shapes = icon.shapes.map( shape => {
		const shapesSvg = [];
		for ( const property in shape ) {
			if ( property === 'type' ) {
				continue;
			}
			shapesSvg.push( `${ property }="${ shape[ property ] }` + '"' );
		}
		return `<${ shape.type } ${ shapesSvg.join( ' ' ) }/>`;
	} ).join();
	return `<svg width="21" height="15" xmlns="http://www.w3.org/2000/svg"><g>${ shapes }</g></svg>`;
}
/* ===================== /TTM 核心区 ===================== */

/* ===================== wtrp 应用层 ===================== */
function persist () {
	localStorage.setItem( 'wtrp2.owned', JSON.stringify( [ ...S.owned ] ) );
	localStorage.setItem( 'wtrp2.targets', JSON.stringify( [ ...S.targets ] ) );
	localStorage.setItem( 'wtrp2.country', S.country );
	localStorage.setItem( 'wtrp2.branch', S.branch );
	localStorage.setItem( 'wtrp2.effRP', S.effRP );
	localStorage.setItem( 'wtrp2.mins', S.mins );
}

async function loadCountry ( country ) {
	if ( S.cache[ country ] ) return S.cache[ country ];
	const data = await fetch( `data/c_${ country }.json` ).then( r => r.json() );
	S.version = data.version;
	$( '#verBadge' ).textContent = `数据版本 ${ data.version }`;
	S.cache[ country ] = data.branches;
	return data.branches;
}

function renderBranch () {
	const entries = ( S.cache[ S.country ] || {} )[ S.branch ] || [];
	S.entries = entries;
	S.byId = {};
	S.prevInCol = {};
	let prevKey = null, prevId = null;
	for ( const e of entries ) {
		S.byId[ e.id ] = e;
		const key = e.branch + '|' + e.rank;
		if ( key === prevKey ) S.prevInCol[ e.id ] = prevId;
		prevKey = key; prevId = e.id;
	}
	drawTree( organizeTree( entries.slice() ) );
	updateStates();
	renderPanel();
}

function updateStates () {
	const path = pathUnion();
	for ( const e of S.entries ) {
		const badge = document.getElementById( e.id );
		if ( !badge ) continue;
		badge.classList.toggle( 'vowned', S.owned.has( e.id ) );
		badge.classList.toggle( 'vtarget', S.targets.has( e.id ) );
		badge.classList.toggle( 'vpath', path.has( e.id ) && !S.targets.has( e.id ) );
	}
}

/* 多目标前置闭包并集 */
function pathUnion () {
	const union = new Set();
	for ( const t of S.targets ) {
		let id = t; const seen = new Set();
		while ( id && !S.owned.has( id ) ) {
			if ( seen.has( id ) ) break;
			seen.add( id );
			const v = S.byId[ id ];
			if ( !v ) break;
			union.add( id );
			id = v.required_vehicle || S.prevInCol[ id ] || null;
		}
	}
	return union;
}
/* 单目标闭包(面板明细用) */
function pathFor ( targetId ) {
	const ids = [];
	let id = targetId; const seen = new Set();
	while ( id && !S.owned.has( id ) ) {
		if ( seen.has( id ) ) break;
		seen.add( id );
		const v = S.byId[ id ];
		if ( !v ) break;
		ids.push( id );
		id = v.required_vehicle || S.prevInCol[ id ] || null;
	}
	ids.reverse();
	return ids;
}

function openPopup ( id ) {
	const v = S.byId[ id ];
	if ( !v ) return;
	$( '#vPopupTitle' ).innerText = `${ v.name }(${ TYPE_ZH[ v.type ] || v.type })`;
	const isT = v.type === 'researchable';
	const cost = v.ge_cost > 0 && v.type !== 'researchable' ? `<b>${ fmt( v.ge_cost ) } 金鹰</b>` : `<b>${ fmt( v.req_exp ) } RP</b> + ${ fmt( v.value )} 银狮`;
	$( '#vPopupBody' ).innerHTML = `
		<img id="vPopupImg" src="/wtapi/assets/images/${ id.toLowerCase() }.png" onerror="this.style.display='none'" alt="">
		<div id="vPopupStats">
			${ id }<br>
			等级 ${ ROMAN[ v.rank ] || v.rank } · BR ${ v.br.toFixed( 1 ) }<br>
			研发开销: ${ cost }<br>
			${ v.required_vehicle ? `前置: ${ ( S.byId[ v.required_vehicle ] || {} ).name || v.required_vehicle }` : ( S.prevInCol[ id ] ? `前置(列序): ${ ( S.byId[ S.prevInCol[ id ] ] || {} ).name || S.prevInCol[ id ] }` : '前置: 无(起点)') }
		</div>
		<div id="vPopupBtns">
			<button id="btnOwn" class="${ S.owned.has( id ) ? 'on-own' : '' }">已拥有${ S.owned.has( id ) ? ' ✓' : '' }</button>
			<button id="btnTgt" class="${ S.targets.has( id ) ? 'on-tgt' : '' }">${ S.targets.has( id ) ? '✓ 目标' : '加入目标' }</button>
		</div>`;
	$( '#vehicleDisplayModal' ).style.display = 'block';
	document.body.style.overflow = 'hidden';
	$( '#btnOwn' ).onclick = () => {
		S.owned.has( id ) ? S.owned.delete( id ) : S.owned.add( id );
		persist(); updateStates(); renderPanel(); openPopup( id );
	};
	$( '#btnTgt' ).onclick = () => {
		S.targets.has( id ) ? S.targets.delete( id ) : S.targets.add( id );
		persist(); updateStates(); renderPanel(); openPopup( id );
	};
}
function closePopup () {
	$( '#vehicleDisplayModal' ).style.display = 'none';
	document.body.style.overflow = '';
}

function renderPanel () {
	const p = $( '#wtrpPanel' );
	const union = pathUnion();
	let rp = 0, sl = 0, ge = 0, n = 0;
	for ( const id of union ) {
		const v = S.byId[ id ];
		if ( !v ) continue;
		n++;
		if ( v.type === 'researchable' ) { rp += v.req_exp || 0; sl += v.value || 0; }
		else if ( v.type === 'premium' || v.type === 'pack' || v.type === 'market' ) ge += v.ge_cost || 0;
		else if ( v.type === 'squadron' ) rp += v.req_exp || 0;
	}
	const battles = Math.ceil( rp / Math.max( 1, S.effRP ) );
	const hours = battles * Math.max( 1, S.mins ) / 60;
	const tRows = [ ...S.targets ].map( t => {
		const ids = pathFor( t );
		let trp = 0;
		ids.forEach( i => { const v = S.byId[ i ]; if ( v && ( v.type === 'researchable' || v.type === 'squadron' ) ) trp += v.req_exp || 0; } );
		return `<div class="prow"><span class="pn">${ ( S.byId[ t ] || {} ).name || t } <a href="#" data-rm="${ t }" style="color:#da3636">×</a></span><span>${ ids.length } 台 / ${ fmt( trp ) } RP</span></div>`;
	} ).join( '' );
	p.innerHTML = `
		<h3>研发计算</h3>
		<div class="trow"><span>有效RP/场</span><span><input type="number" id="effRP" value="${ S.effRP }" min="1" step="100">
		<button data-v="2000">F2P</button><button data-v="8000">高账</button><button data-v="18000">高+符</button></span></div>
		<div class="trow"><span>每场分钟</span><input type="number" id="mins" value="${ S.mins }" min="1" step="1"></div>
		${ S.targets.size ? `
		<div class="trow"><span>待研发</span><b>${ n } 台</b></div>
		<div class="trow"><span>剩余研发点</span><b>${ fmt( rp ) } RP</b></div>
		<div class="trow"><span>购买银狮</span><b>${ fmt( sl ) }</b></div>
		${ ge > 0 ? `<div class="trow"><span>高级/市场直购</span><b>${ fmt( ge ) } 金鹰</b></div>` : '' }
		<div class="trow"><span>约合场次</span><b>${ fmt( battles )} 场</b></div>
		<div class="trow"><span>约合时长</span><b>${ hours >= 100 ? fmt( Math.round( hours ) ) : hours.toFixed( 1 ) } 小时</b></div>
		<div class="trow"><span>金鹰全转换</span><b>${ fmt( Math.ceil( rp / 45 ) ) } 金鹰</b></div>
		<div class="plist">${ tRows }</div>
		<button class="small" id="btnClr" style="margin-top:8px">清空全部目标</button>
		` : `<div class="empty">在科技树里点击载具 → 「加入目标」(可多选)。<br><br>
		绿色 ✓ = 已拥有(点击载具标记,自动保存);<br>
		金色框 = 目标;蓝色虚线 = 路径上的前置。<br><br>
		当前已标记拥有:<b>${ S.owned.size }</b> 台<br>
		路径 = 前置链(required_vehicle,空则按列序);<br>
		场次按你输入的"有效RP/场"净值估算;金鹰=RP÷45。</div>`}
	`;
	const eff = p.querySelector( '#effRP' ), mins = p.querySelector( '#mins' );
	eff.oninput = () => { S.effRP = Math.max( 1, +eff.value || 1 ); persist(); renderPanel(); };
	mins.oninput = () => { S.mins = Math.max( 1, +mins.value || 1 ); persist(); renderPanel(); };
	p.querySelectorAll( 'button[data-v]' ).forEach( b => b.onclick = () => { S.effRP = +b.dataset.v; persist(); renderPanel(); } );
	p.querySelectorAll( 'a[data-rm]' ).forEach( a => a.onclick = e => { e.preventDefault(); S.targets.delete( a.dataset.rm ); persist(); updateStates(); renderPanel(); } );
	const clr = p.querySelector( '#btnClr' );
	if ( clr ) clr.onclick = () => { S.targets.clear(); persist(); updateStates(); renderPanel(); };
}

function renderTabs () {
	$( '#countryTabs' ).innerHTML = COUNTRIES.map( ( [ k, n ] ) =>
		`<button class="wtab${ k === S.country ? ' active' : '' }" data-c="${ k }">${ n }</button>` ).join( '' );
	$( '#branchTabs' ).innerHTML = BRANCHES.map( ( [ k, n ] ) =>
		`<button class="wtab${ k === S.branch ? ' active' : '' }" data-b="${ k }">${ n }</button>` ).join( '' );
	$( '#countryTabs' ).onclick = async e => {
		const b = e.target.closest( '[data-c]' ); if ( !b ) return;
		S.country = b.dataset.c; persist();
		document.querySelectorAll( '#countryTabs .wtab' ).forEach( t => t.classList.toggle( 'active', t === b ) );
		await loadCountry( S.country );
		if ( !( ( S.cache[ S.country ] || {} )[ S.branch ] ) ) { S.branch = 'ground'; }
		renderTabs(); renderBranch();
	};
	$( '#branchTabs' ).onclick = e => {
		const b = e.target.closest( '[data-b]' ); if ( !b ) return;
		S.branch = b.dataset.b; persist();
		document.querySelectorAll( '#branchTabs .wtab' ).forEach( t => t.classList.toggle( 'active', t === b ) );
		renderBranch();
	};
}

/* 树点击:弹窗 / 文件夹展开(TTM 行为 + 文件夹内成员可点) */
document.querySelector( '#techTree' ).addEventListener( 'click', e => {
	let element = e.target;
	while ( element && !element.id ) {
		if ( element.id === 'techTree' ) return;
		element = element.parentNode;
	}
	if ( !element || element.id === 'techTree' || !element.id ) return;
	if ( !S.byId[ element.id ] ) return;
	if ( isInFolder( element ) ) { openPopup( element.id ); return; }
	const folderDiv = isFolderRoot( element );
	if ( folderDiv && folderDiv.style.visibility !== 'visible' ) {
		folderDiv.style.visibility = 'visible';
		return;
	}
	openPopup( element.id );
} );

$( '#vPopupClose' ).addEventListener( 'click', closePopup );
window.addEventListener( 'click', e => { if ( e.target.id === 'vehicleDisplayModal' ) closePopup(); } );
$( '#wtrpToggle' ).addEventListener( 'click', () => $( '#wtrpPanel' ).classList.toggle( 'hidden' ) );

( async function init () {
	renderTabs();
	await loadCountry( S.country );
	if ( !( ( S.cache[ S.country ] || {} )[ S.branch ] ) ) S.branch = 'ground';
	renderTabs();
	renderBranch();
} )().catch( err => {
	$( '#verBadge' ).textContent = '加载失败';
	console.error( err );
} );
