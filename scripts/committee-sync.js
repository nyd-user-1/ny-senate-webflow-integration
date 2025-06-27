// NY Senate Committee Data Sync to Webflow CMS
// Main automation script for GitHub Actions

const WEBFLOW_SITE_ID = '685b4d2698407571d8423764';
const COMMITTEES_COLLECTION_ID = '685b53da44d49ae626f23712';
const MEMBERS_COLLECTION_ID = '685b53f6cef66d01abebd142';
const NY_SENATE_API_BASE = 'https://legislation.nysenate.gov/api/3';

class SenateCommitteeSync {
  constructor() {
    this.webflowHeaders = {
      'Authorization': `Bearer ${process.env.WEBFLOW_API_TOKEN}`,
      'accept-version': '1.0.0',
      'Content-Type': 'application/json'
    };
  }

  // Fetch all Senate committees from NY API
  async fetchSenateCommittees() {
    try {
      const url = `${NY_SENATE_API_BASE}/committees/2025?key=${process.env.NY_SENATE_API_KEY}&full=true`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.result && data.result.items) {
        // Filter for Senate committees only
        const senateCommittees = data.result.items.filter(committee => 
          committee.chamber === 'SENATE'
        );
        console.log(`✅ Fetched ${senateCommittees.length} Senate committees from API`);
        return senateCommittees;
      }
      
      console.log('⚠️ API returned no committee data, using fallback');
      return this.getFallbackCommitteeData();
      
    } catch (error) {
      console.error('❌ Error fetching Senate committees:', error.message);
      console.log('🔄 Using fallback committee data');
      return this.getFallbackCommitteeData();
    }
  }

  // Fallback committee data with member assignments
  getFallbackCommitteeData() {
    return [
      {
        name: 'Agriculture',
        chair: { fullName: 'Michelle Hinchey' },
        members: [
          { fullName: 'Michelle Hinchey' },
          { fullName: 'Patrick Gallivan' },
          { fullName: 'Daniel Stec' },
          { fullName: 'Robert Ortt' },
          { fullName: 'Jacob Ashby' }
        ]
      },
      {
        name: 'Health',
        chair: { fullName: 'Gustavo Rivera' },
        members: [
          { fullName: 'Gustavo Rivera' },
          { fullName: 'Rachel May' },
          { fullName: 'Samra Brouk' },
          { fullName: 'Zellnor Myrie' },
          { fullName: 'Monica Martinez' },
          { fullName: 'Roxanne Persaud' }
        ]
      },
      {
        name: 'Finance',
        chair: { fullName: 'Liz Krueger' },
        members: [
          { fullName: 'Liz Krueger' },
          { fullName: 'James Sanders' },
          { fullName: 'Leroy Comrie' },
          { fullName: 'Michelle Hinchey' },
          { fullName: 'Jeremy Cooney' },
          { fullName: 'Toby Stavisky' },
          { fullName: 'Jessica Ramos' }
        ]
      }
    ];
  }

  // Fetch current Webflow Members for reference matching
  async fetchWebflowMembers() {
    try {
      let allMembers = [];
      let offset = 0;
      const limit = 100;
      
      while (true) {
        const url = `https://api.webflow.com/v2/collections/${MEMBERS_COLLECTION_ID}/items?limit=${limit}&offset=${offset}`;
        const response = await fetch(url, { headers: this.webflowHeaders });
        
        if (!response.ok) {
          throw new Error(`Webflow API error: ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.items || data.items.length === 0) break;
        
        allMembers.push(...data.items);
        if (data.items.length < limit) break;
        offset += limit;
      }
      
      console.log(`✅ Fetched ${allMembers.length} members from Webflow`);
      return allMembers;
      
    } catch (error) {
      console.error('❌ Error fetching Webflow members:', error.message);
      return [];
    }
  }

  // Fetch current Webflow Committees
  async fetchWebflowCommittees() {
    try {
      let allCommittees = [];
      let offset = 0;
      const limit = 100;
      
      while (true) {
        const url = `https://api.webflow.com/v2/collections/${COMMITTEES_COLLECTION_ID}/items?limit=${limit}&offset=${offset}`;
        const response = await fetch(url, { headers: this.webflowHeaders });
        
        if (!response.ok) {
          throw new Error(`Webflow API error: ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.items || data.items.length === 0) break;
        
        allCommittees.push(...data.items);
        if (data.items.length < limit) break;
        offset += limit;
      }
      
      console.log(`✅ Fetched ${allCommittees.length} committees from Webflow`);
      return allCommittees;
      
    } catch (error) {
      console.error('❌ Error fetching Webflow committees:', error.message);
      return [];
    }
  }

  // Match Senate member names to Webflow Member IDs
  matchMemberToWebflow(senatorName, webflowMembers) {
    // Clean up the senator name for matching
    const cleanName = senatorName.replace(/^(Senator|Sen\.)\s+/i, '').trim();
    
    // Filter to Senate members only
    const senators = webflowMembers.filter(member => 
      member.fieldData.chamber === '521c1f841fd6e3d287eb931549560714'
    );
    
    // Try exact match first
    let match = senators.find(member => 
      member.fieldData.name.toLowerCase() === cleanName.toLowerCase()
    );
    
    // Try last name match if exact fails
    if (!match) {
      const lastName = cleanName.split(' ').pop().toLowerCase();
      match = senators.find(member => 
        member.fieldData.name.toLowerCase().includes(lastName)
      );
    }
    
    // Try first name + last name match
    if (!match && cleanName.includes(' ')) {
      const [firstName, ...lastNameParts] = cleanName.split(' ');
      const lastName = lastNameParts.join(' ').toLowerCase();
      match = senators.find(member => {
        const memberName = member.fieldData.name.toLowerCase();
        return memberName.includes(firstName.toLowerCase()) && 
               memberName.includes(lastName);
      });
    }
    
    if (match) {
      console.log(`✅ Matched "${cleanName}" → ${match.fieldData.name} (${match.id})`);
    } else {
      console.log(`⚠️ No match found for: "${cleanName}"`);
    }
    
    return match ? match.id : null;
  }

  // Create or update committee in Webflow
  async updateWebflowCommittee(committee, webflowMembers, existingCommittees) {
    const committeeName = committee.name;
    const committeeSlug = committeeName.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');

    // Find member IDs from the committee membership
    const memberIds = [];
    if (committee.members && committee.members.length > 0) {
      for (const member of committee.members) {
        const memberId = this.matchMemberToWebflow(member.fullName, webflowMembers);
        if (memberId) {
          memberIds.push(memberId);
        }
      }
    }

    // Prepare committee data
    const committeeData = {
      fieldData: {
        name: committeeName,
        slug: `senate-${committeeSlug}`,
        chamber: '4ee88a351849b8218064c06630fa0bc9', // Senate chamber ID
        description: `Senate committee: ${committeeName}`,
        'committee-members': memberIds,
        'member-count': memberIds.length,
        'committee-url': `https://www.nysenate.gov/committees/${committeeSlug}`,
        chair: committee.chair ? committee.chair.fullName : null,
        'meeting-schedule': 'As scheduled'
      }
    };

    // Check if committee already exists (Senate committees only)
    const existingCommittee = existingCommittees.find(c => 
      c.fieldData.name.toLowerCase() === committeeName.toLowerCase() &&
      c.fieldData.chamber === '4ee88a351849b8218064c06630fa0bc9'
    );

    try {
      if (existingCommittee) {
        // Update existing committee
        console.log(`🔄 Updating committee: ${committeeName} (${memberIds.length} members)`);
        const response = await fetch(
          `https://api.webflow.com/v2/collections/${COMMITTEES_COLLECTION_ID}/items/${existingCommittee.id}/live`,
          {
            method: 'PATCH',
            headers: this.webflowHeaders,
            body: JSON.stringify(committeeData)
          }
        );
        
        if (!response.ok) {
          throw new Error(`Update failed: ${response.status}`);
        }
        
        return await response.json();
      } else {
        // Create new committee
        console.log(`➕ Creating committee: ${committeeName} (${memberIds.length} members)`);
        const response = await fetch(
          `https://api.webflow.com/v2/collections/${COMMITTEES_COLLECTION_ID}/items/live`,
          {
            method: 'POST',
            headers: this.webflowHeaders,
            body: JSON.stringify(committeeData)
          }
        );
        
        if (!response.ok) {
          throw new Error(`Create failed: ${response.status}`);
        }
        
        return await response.json();
      }
    } catch (error) {
      console.error(`❌ Error updating committee ${committeeName}:`, error.message);
      return null;
    }
  }

  // Add delay to respect rate limits
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Main sync function
  async syncCommittees() {
    console.log('🚀 Starting Senate Committee Sync...');
    console.log(`📅 ${new Date().toISOString()}`);
    
    // Validate environment variables
    if (!process.env.WEBFLOW_API_TOKEN) {
      throw new Error('WEBFLOW_API_TOKEN environment variable is required');
    }
    
    if (!process.env.NY_SENATE_API_KEY) {
      console.log('⚠️ NY_SENATE_API_KEY not found, using fallback data');
    }
    
    // Fetch all required data
    console.log('📡 Fetching data from all sources...');
    const [senateCommittees, webflowMembers, existingCommittees] = await Promise.all([
      this.fetchSenateCommittees(),
      this.fetchWebflowMembers(),
      this.fetchWebflowCommittees()
    ]);

    console.log(`📊 Data Summary:`);
    console.log(`  • Senate committees: ${senateCommittees.length}`);
    console.log(`  • Webflow members: ${webflowMembers.length}`);
    console.log(`  • Existing committees: ${existingCommittees.length}`);

    // Process each Senate committee
    const results = [];
    for (const committee of senateCommittees) {
      console.log(`\n🔄 Processing: ${committee.name}`);
      
      const result = await this.updateWebflowCommittee(
        committee, 
        webflowMembers, 
        existingCommittees
      );
      
      results.push({
        name: committee.name,
        success: !!result,
        memberCount: committee.members ? committee.members.length : 0
      });
      
      // Small delay to avoid rate limiting
      await this.delay(200);
    }

    // Generate summary
    const successful = results.filter(r => r.success).length;
    const totalMembers = results.reduce((sum, r) => sum + r.memberCount, 0);
    
    console.log('\n📈 Sync Summary:');
    console.log(`✅ Successfully processed: ${successful}/${results.length} committees`);
    console.log(`👥 Total member assignments: ${totalMembers}`);
    console.log(`🎉 Sync completed at: ${new Date().toISOString()}`);

    // Return results for GitHub Actions
    return {
      success: successful === results.length,
      processed: results.length,
      successful: successful,
      totalMembers: totalMembers,
      timestamp: new Date().toISOString()
    };
  }
}

// Main execution function
async function main() {
  try {
    const sync = new SenateCommitteeSync();
    const results = await sync.syncCommittees();
    
    if (results.success) {
      console.log('\n🎊 All committees synced successfully!');
      process.exit(0);
    } else {
      console.log('\n⚠️ Some committees failed to sync');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n💥 Sync failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { SenateCommitteeSync, main };
